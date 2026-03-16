"""
Validator entrypoint for the OpenMind subnet.

Concrete implementation of a Bittensor validator that queries miners using the
`OpenMindRequest` synapse and scores them using `openmind.scoring`.
"""

from __future__ import annotations

import asyncio
import time
from typing import Any, Dict, List, Mapping, Tuple

import bittensor as bt

from openmind.protocol import OpenMindRequest
from openmind.checkpoint import save_checkpoint
from openmind.scoring import get_rewards
from openmind.utils.uids import get_random_uids


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

        # Core Bittensor components (using SDK v10 classes).
        self.wallet = bt.Wallet(config=self.config)

        try:
            self.subtensor = bt.Subtensor(config=self.config)
        except Exception as e:  # pragma: no cover - environment dependent
            bt.logging.error(f"Failed to create Subtensor for validator: {e}")
            self.subtensor = None

        if self.subtensor is not None:
            try:
                self.metagraph = self.subtensor.metagraph(netuid=self.config.netuid)
            except Exception as e:  # pragma: no cover - environment dependent
                bt.logging.error(f"Failed to sync metagraph for validator: {e}")
                self.metagraph = None
        else:
            self.metagraph = None

        # Dendrite client for querying miners.
        try:
            self.dendrite = bt.Dendrite(wallet=self.wallet)
        except Exception as e:  # pragma: no cover - environment dependent
            bt.logging.error(f"Failed to create Dendrite for validator: {e}")
            self.dendrite = None

        # Internal validation state.
        self.step: int = 0

        # Per-miner EMA scores.
        self.scores = (
            [0.0 for _ in range(len(self.metagraph.uids))]
            if self.metagraph is not None
            else []
        )

        # Ground-truth state for challenges.
        self._retrieval_probes: Dict[str, List[str]] = {}
        self._storage_challenges: Dict[str, str] = {}
        self._version_challenges: Dict[str, Dict[str, Any]] = {}
        # Pool of real chunk IDs observed in miner responses.
        self._known_chunk_ids: List[str] = []

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
            # Sample up to 5 unique IDs from the pool.
            unique_ids = list(dict.fromkeys(self._known_chunk_ids))
            k = min(5, len(unique_ids))
            probes = unique_ids[:k]

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
        `openmind.scoring.reward`.
        """
        metrics_list: List[Dict[str, Any]] = []

        probes = self._retrieval_probes.get(challenge_id, [])

        for resp, latency in zip(responses, per_uid_latency_ms):
            metrics: Dict[str, Any] = {}

            # Defaults.
            metrics["storage_ok"] = False
            metrics["retrieval_recall"] = 0.0
            metrics["version_ok"] = False
            metrics["checkpoint_ok"] = False
            metrics["latency_ms"] = latency

            # Mode 0: retrieval-focused metrics.
            if mode == 0:
                metrics["retrieval_recall"] = self._compute_retrieval_recall(
                    resp, probes
                )

            # Mode 1: storage / durability possession challenge (stub).
            # In a future iteration, miners will return hashes or reconstructed
            # bytes to prove possession; for now we treat any non-empty results
            # as a weak storage signal.
            if mode == 1:
                results = getattr(resp, "results", None)
                if results is None and isinstance(resp, Mapping):
                    results = resp.get("results")
                metrics["storage_ok"] = bool(results)

            # Mode 2: versioning / checkpoint correctness (stub).
            # Once miners support full as_of/version_id/checkpoint flows,
            # validators will populate these based on scripted sequences.
            if mode == 2:
                version_ok = getattr(resp, "version_ok", None)
                checkpoint_ok = getattr(resp, "checkpoint_ok", None)
                if version_ok is not None:
                    metrics["version_ok"] = bool(version_ok)
                if checkpoint_ok is not None:
                    metrics["checkpoint_ok"] = bool(checkpoint_ok)

            metrics_list.append(metrics)

        return metrics_list

    async def forward(self):
        """
        Validator forward pass modelled after the template's forward loop.
        - Samples a set of miner UIDs.
        - Builds an `OpenMindRequest`.
        - Queries miners via dendrite.
        - Scores responses and updates moving-average scores.
        """
        # Decide challenge mode based on step to exercise different behaviours.
        # 0: retrieval-focused; 1: storage/durability; 2: versioning/checkpoint.
        mode = int(self.step) % 3

        challenge_id, probes = self._build_retrieval_challenge()

        if self.metagraph is None or self.dendrite is None:
            bt.logging.warning("Metagraph or Dendrite not available; skipping forward step.")
            return

        # Sample which miners to query.
        miner_uids: List[int] = get_random_uids(
            self, k=self.config.neuron.sample_size
        )

        # Build a simple request for this step.
        synapse = OpenMindRequest(
            session_id=f"validator-session-{self.wallet.hotkey.ss58_address}",
            query=f"step-{self.step}",
            top_k=10,
            filters={"challenge_mode": mode},
        )

        # Query selected miner axons and capture basic latency per miner.
        start = time.time()
        responses = await self.dendrite(
            axons=[self.metagraph.axons[uid] for uid in miner_uids],
            synapse=synapse,
            deserialize=True,
        )
        elapsed_ms = (time.time() - start) * 1000.0
        per_uid_latency_ms = [elapsed_ms for _ in miner_uids]

        bt.logging.info(f"Received responses: {responses}")

        # Update known chunk IDs pool from actual miner results so future
        # retrieval challenges use real stored chunks as probes.
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

        # Compute metric dicts and rewards based on responses.
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

        # Save a simple checkpoint for this forward step.
        save_checkpoint(
            workflow_id=f"wf-{self.wallet.hotkey.ss58_address}",
            step=int(self.step),
            state={
                "variables": {"sample_size": self.config.neuron.sample_size},
                "tool_results": responses,
                "decisions": [f"queried_{len(miner_uids)}_miners"],
            },
        )

        # Update scores with EMA behaviour.
        alpha = 0.5  # simple fixed EMA factor for now
        for uid, r in zip(miner_uids, rewards):
            old = self.scores[uid]
            self.scores[uid] = alpha * float(r) + (1.0 - alpha) * old

        bt.logging.info(f"Updated EMA scores (sample): {self.scores[:5]}")

    def run(self) -> None:
        """
        Main loop: repeatedly run forward passes and update scores.
        """
        bt.logging.info("OpenMind validator starting.")
        loop = asyncio.get_event_loop()

        try:
            while True:
                bt.logging.info(f"Validator step {self.step}")
                loop.run_until_complete(self.forward())
                self.step += 1
        except KeyboardInterrupt:
            bt.logging.info("OpenMind validator shutting down.")


def run() -> None:
    """
    Main entrypoint used by `python neuron.py --role validator`.
    """
    validator = Validator()
    validator.run()

