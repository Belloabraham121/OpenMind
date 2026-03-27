"""
Validator entrypoint for the OpenMind subnet.

Concrete implementation of a Bittensor validator that queries miners using the
`OpenMindRequest` synapse and scores them using `openmind.scoring`.
"""

import asyncio
import copy
import os
import random
import threading
import time
from typing import Any, Dict, List, Mapping, Tuple

import bittensor as bt
import uvicorn

from openmind.protocol import OpenMindRequest
from openmind.checkpoint import save_checkpoint
from openmind.scoring import get_rewards
from openmind.utils.uids import get_random_uids
from gateway.api import app as gateway_app, configure as configure_gateway


class Validator:
    """
    OpenMind validator neuron.
    """

    def __init__(self, config: bt.Config | None = None):
        """
        Minimal validator implementation without relying on the template base
        classes. Sets up wallet, subtensor, metagraph, and dendrite.
        """
        self.config = config or bt.Config()

        # Local dev defaults.
        self.netuid = getattr(self.config, "netuid", None) or 2
        self.chain_endpoint = "ws://127.0.0.1:9944"
        self.wallet_name = "test-coldkey"
        self.wallet_hotkey = "validator-hotkey"
        self.wallet_path = "~/Documents/bittensor-test-wallet"
        self.sample_size = 4
        self.local_miner_host = os.environ.get("OPENMIND_MINER_HOST", "127.0.0.1")
        self.local_miner_port = int(os.environ.get("OPENMIND_MINER_PORT", "8091"))

        # Standard Bittensor components — pass params directly to constructors.
        self.wallet = bt.Wallet(
            name=self.wallet_name,
            hotkey=self.wallet_hotkey,
            path=self.wallet_path,
        )

        try:
            self.subtensor = bt.Subtensor(network=self.chain_endpoint)
        except Exception as e:
            bt.logging.error(f"Failed to create Subtensor for validator: {e}")
            self.subtensor = None

        if self.subtensor is not None:
            try:
                self.metagraph = self.subtensor.metagraph(netuid=self.netuid)
            except Exception as e:
                bt.logging.error(f"Failed to sync metagraph for validator: {e}")
                self.metagraph = None
        else:
            self.metagraph = None

        try:
            self.dendrite = bt.Dendrite(wallet=self.wallet)
        except Exception as e:
            bt.logging.error(f"Failed to create Dendrite for validator: {e}")
            self.dendrite = None

        self.step: int = 0

        self.scores = (
            [0.0 for _ in range(len(self.metagraph.uids))]
            if self.metagraph is not None
            else []
        )

        self._retrieval_probes: Dict[str, List[str]] = {}
        self._storage_challenges: Dict[str, str] = {}
        self._version_challenges: Dict[str, Dict[str, Any]] = {}
        self._known_chunk_ids: List[str] = []

        bt.logging.info(
            f"OpenMind validator initialised "
            f"(netuid={self.netuid}, "
            f"endpoint={self.chain_endpoint})"
        )
        if self.subtensor is None:
            bt.logging.warning("Validator running without Subtensor client (offline mode).")
        if self.metagraph is None:
            bt.logging.warning("Validator metagraph not available; EMA scores will not update.")
        if self.dendrite is None:
            bt.logging.warning("Validator Dendrite not available; cannot query miners.")

    def _patch_axons(self, axons: List[Any]) -> List[Any]:
        """
        Replace axons with port 0 (common on localnet) with the known local miner.
        """
        patched: List[Any] = []
        for ax in axons:
            if getattr(ax, "port", 0) == 0:
                p = copy.deepcopy(ax)
                p.ip = self.local_miner_host
                p.port = self.local_miner_port
                patched.append(p)
            else:
                patched.append(ax)
        return patched

    def _current_challenge_id(self) -> str:
        return f"step-{int(self.step)}"

    def _build_retrieval_challenge(self) -> Tuple[str, List[str]]:
        """
        Build a retrieval ground truth based on *real* chunk IDs observed in
        prior miner responses.

        The validator maintains a rolling pool of known chunk IDs taken from
        `result["id"]` fields. For each challenge we sample a small subset from
        this pool; these are the probes used to compute recall.
        """
        challenge_id = self._current_challenge_id()

        # If we have no known IDs yet, this challenge cannot compute recall.
        # We still register an empty probe list so the code path is uniform.
        if not self._known_chunk_ids:
            probes: List[str] = []
        else:
            unique_ids = list(dict.fromkeys(self._known_chunk_ids))
            k = min(5, len(unique_ids))
            probes = random.sample(unique_ids, k=k) if k else []

        self._retrieval_probes[challenge_id] = probes
        return challenge_id, probes

    def _compute_retrieval_recall(
        self, response: Any, probes: List[str]
    ) -> float:
        """
        Compute recall over a simple set of probe IDs.
        Expects each result to optionally expose an 'id' field.
        """
        results = getattr(response, "results", None)
        if results is None and isinstance(response, Mapping):
            results = response.get("results")
        if not results:
            return 0.0

        returned_ids = {
            r.get("id")
            for r in results
            if isinstance(r, Mapping) and "id" in r
        }
        if not returned_ids:
            return 0.0

        hits = len(set(probes) & returned_ids)
        return float(hits) / float(len(probes)) if probes else 0.0

    def _metrics_from_responses(
        self,
        mode: int,
        responses: List[Any],
        per_uid_latency_ms: List[float],
        challenge_id: str,
    ) -> List[Dict[str, Any]]:
        """
        Convert raw miner responses into metric dicts understood by
        ``openmind.scoring.reward``.
        """
        metrics_list: List[Dict[str, Any]] = []

        probes = self._retrieval_probes.get(challenge_id, [])

        for resp, latency in zip(responses, per_uid_latency_ms):
            metrics: Dict[str, Any] = {}

            metrics["storage_ok"] = False
            metrics["retrieval_recall"] = 0.0
            metrics["version_ok"] = False
            metrics["checkpoint_ok"] = False
            metrics["latency_ms"] = latency
            metrics["extraction_count"] = 0
            metrics["extraction_quality"] = 0.0
            metrics["relationship_accuracy"] = 0.0
            metrics["temporal_accuracy"] = 0.0

            if mode == 0:
                metrics["retrieval_recall"] = self._compute_retrieval_recall(
                    resp, probes
                )

            if mode == 1:
                results = getattr(resp, "results", None)
                if results is None and isinstance(resp, Mapping):
                    results = resp.get("results")
                metrics["storage_ok"] = bool(results)

            if mode == 2:
                version_ok = getattr(resp, "version_ok", None)
                checkpoint_ok = getattr(resp, "checkpoint_ok", None)
                if version_ok is not None:
                    metrics["version_ok"] = bool(version_ok)
                if checkpoint_ok is not None:
                    metrics["checkpoint_ok"] = bool(checkpoint_ok)

            # Mode 3: reconstruction / extraction quality (from retrieval responses)
            if mode == 3:
                results = getattr(resp, "results", None)
                if results is None and isinstance(resp, Mapping):
                    results = resp.get("results")
                if results and isinstance(results, list):
                    for r in results:
                        if isinstance(r, Mapping):
                            fc = r.get("fact_count", 0)
                            if fc:
                                metrics["extraction_count"] = int(fc)
                                metrics["extraction_quality"] = min(1.0, int(fc) / 3.0)
                                metrics["storage_ok"] = True

            # Mode 4: temporal signal quality (from retrieval responses)
            if mode == 4:
                results = getattr(resp, "results", None)
                if results is None and isinstance(resp, Mapping):
                    results = resp.get("results")
                if results and isinstance(results, list):
                    for r in results:
                        if isinstance(r, Mapping) and r.get("status") == "stored":
                            metrics["storage_ok"] = True
                            metrics["temporal_accuracy"] = 1.0

            metrics_list.append(metrics)

        return metrics_list

    async def forward(self):
        """
        Validator forward pass with 5 challenge modes (same PRD-style query to miners;
        scoring differs per mode). All modes issue retrieval-style synapses — no synthetic
        store payloads. Mode 0 uses chunk-id probes from ``_known_chunk_ids`` (possession /
        recall on data miners have already returned). Modes 1–4 reuse the same request shape;
        miners are judged on non-empty results, version fields, fact_count, etc.

        This aligns with the PRD's random / probe-based challenges that verify miners still
        surface memory that has flowed through the subnet rather than canned benchmark text.
        """
        mode = int(self.step) % 5

        challenge_id, probes = self._build_retrieval_challenge()

        if self.metagraph is None or self.dendrite is None:
            bt.logging.warning("Metagraph or Dendrite not available; skipping forward step.")
            return

        miner_uids: List[int] = get_random_uids(
            self, k=self.sample_size
        )

        bt.logging.info(
            f"Validator step={self.step} mode={mode} querying {len(miner_uids)} miners."
        )

        synapse = OpenMindRequest(
            session_id=f"validator-session-{self.wallet.hotkey.ss58_address}",
            query=f"step-{self.step}",
            top_k=10,
            filters={"challenge_mode": mode},
        )

        start = time.time()
        axons = self._patch_axons([self.metagraph.axons[uid] for uid in miner_uids])
        responses = await self.dendrite(
            axons=axons,
            synapse=synapse,
            deserialize=True,
        )
        elapsed_ms = (time.time() - start) * 1000.0
        per_uid_latency_ms = [elapsed_ms for _ in miner_uids]

        bt.logging.info(f"Received responses: {responses}")

        for resp in responses:
            results = getattr(resp, "results", None)
            if results is None and isinstance(resp, Mapping):
                results = resp.get("results")
            if not results:
                continue

            for r in results:
                if isinstance(r, Mapping) and "id" in r:
                    cid = r["id"]
                    if isinstance(cid, str):
                        self._known_chunk_ids.append(cid)

        metrics = self._metrics_from_responses(
            mode=mode,
            responses=responses,
            per_uid_latency_ms=per_uid_latency_ms,
            challenge_id=challenge_id,
        )

        rewards = get_rewards(
            step=self.step,
            responses=metrics,
        )

        bt.logging.info(f"Scored responses: {rewards}")

        save_checkpoint(
            workflow_id=f"wf-{self.wallet.hotkey.ss58_address}",
            step=int(self.step),
            state={
                "variables": {"sample_size": self.sample_size},
                "tool_results": responses,
                "decisions": [f"queried_{len(miner_uids)}_miners"],
            },
        )

        alpha = 0.5
        for uid, r in zip(miner_uids, rewards):
            old = self.scores[uid]
            self.scores[uid] = alpha * float(r) + (1.0 - alpha) * old

        bt.logging.info(f"Updated EMA scores (sample): {self.scores[:5]}")

    def _start_gateway(self, host: str = "0.0.0.0", port: int = 8090) -> None:
        """Launch the REST gateway in a daemon thread."""
        configure_gateway(self)
        config = uvicorn.Config(gateway_app, host=host, port=port, log_level="info")
        server = uvicorn.Server(config)
        thread = threading.Thread(target=server.run, daemon=True)
        thread.start()
        print(f"[GATEWAY] REST API listening on {host}:{port}")

    def run(self) -> None:
        """
        Main loop: start the REST gateway, then repeatedly run forward passes.
        """
        self._start_gateway()

        print("[VALIDATOR] Running main loop (Ctrl+C to stop)...")
        loop = asyncio.get_event_loop()

        try:
            while True:
                print(f"[VALIDATOR] step={self.step}")
                loop.run_until_complete(self.forward())
                self.step += 1
                time.sleep(12)
        except KeyboardInterrupt:
            print("\n[VALIDATOR] Shutting down...")


def run() -> None:
    """
    Main entrypoint used by `python neuron.py --role validator`.
    """
    bt.logging.set_debug()

    validator = Validator()

    status_parts = []
    status_parts.append(f"subtensor={'OK' if validator.subtensor else 'OFFLINE'}")
    status_parts.append(f"metagraph={'OK (n=' + str(validator.metagraph.n) + ')' if validator.metagraph else 'UNAVAILABLE'}")
    status_parts.append(f"dendrite={'OK' if validator.dendrite else 'UNAVAILABLE'}")
    print(f"[VALIDATOR] Init status: {', '.join(status_parts)}")

    validator.run()


if __name__ == "__main__":
    run()
