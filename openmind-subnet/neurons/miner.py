"""
Miner entrypoint for the OpenMind subnet.

Concrete implementation of a Bittensor miner that serves the `OpenMindRequest`
synapse defined in `openmind.protocol`.
"""

import datetime
import time
import typing as t
import uuid

import bittensor as bt

from openmind.protocol import OpenMindRequest
from openmind import retrieval, storage, durability, versioning, checkpoint, shared_space


class Miner:
    """
    OpenMind miner neuron.

    Handles incoming `OpenMindRequest` synapses and returns enriched responses
    containing retrieval results, versioning info, and optional checkpoints.
    """

    def __init__(self, config: t.Optional[bt.Config] = None):
        """
        Minimal miner implementation without relying on the template base
        classes. This configures wallet, subtensor, metagraph, and an axon
        that serves the OpenMind protocol.
        """
        self.config = config or bt.Config()

        # Local dev defaults.
        self.netuid = getattr(self.config, "netuid", None) or 2
        self.chain_endpoint = "ws://127.0.0.1:9944"
        self.wallet_name = "test-coldkey"
        self.wallet_hotkey = "test-hotkey"
        self.wallet_path = "~/Documents/bittensor-test-wallet"

        # Standard Bittensor components — pass params directly to constructors
        # so they don't rely on config namespace structure.
        self.wallet = bt.Wallet(
            name=self.wallet_name,
            hotkey=self.wallet_hotkey,
            path=self.wallet_path,
        )

        try:
            self.subtensor = bt.Subtensor(network=self.chain_endpoint)
        except Exception as e:
            bt.logging.error(f"Failed to create Subtensor for miner: {e}")
            self.subtensor = None

        if self.subtensor is not None:
            try:
                self.metagraph = self.subtensor.metagraph(netuid=self.netuid)
            except Exception as e:
                bt.logging.error(f"Failed to sync metagraph for miner: {e}")
                self.metagraph = None
        else:
            self.metagraph = None

        # Axon creation — pass ip/port explicitly to avoid the external IP
        # lookup that fails in some environments.
        # SDK v10 Axon.attach() inspects function type annotations and breaks
        # on bound methods, so we wrap them as module-level-style closures.
        _self = self

        async def _forward(synapse: OpenMindRequest) -> OpenMindRequest:
            return await _self.forward(synapse)

        async def _blacklist(synapse: OpenMindRequest) -> t.Tuple[bool, str]:
            return await _self.blacklist(synapse)

        async def _priority(synapse: OpenMindRequest) -> float:
            return await _self.priority(synapse)

        try:
            self.axon = bt.Axon(
                wallet=self.wallet,
                ip="0.0.0.0",
                port=8091,
                external_ip="127.0.0.1",
                external_port=8091,
            )
            self.axon.attach(
                forward_fn=_forward,
                blacklist_fn=_blacklist,
                priority_fn=_priority,
            )
        except Exception as e:
            import traceback as _tb
            bt.logging.error(f"Failed to create Axon for miner: {e}\n{_tb.format_exc()}")
            self.axon = None

        self.should_exit = False

    async def forward(self, synapse: OpenMindRequest) -> OpenMindRequest:
        """
        Core OpenMind miner logic.

        For now this implements a minimal MVP:
        - validates shared-space access (if provided)
        - performs a stubbed retrieval call
        - attaches empty versioning / checkpoint metadata
        """
        # Enforce shared-space access control if a shared_space_id is present.
        if synapse.shared_space_id is not None:
            authorized = shared_space.authorize_access(
                shared_space_id=synapse.shared_space_id,
                author=synapse.author,
                auth_metadata=synapse.auth_metadata,
            )
            if not authorized:
                bt.logging.warning("Unauthorized shared-space access.")
                # No results returned for unauthorized requests.
                synapse.results = []
                return synapse

        action = (synapse.filters or {}).get("_action")

        if action == "store":
            chunk_id = str(uuid.uuid4())
            ts = datetime.datetime.now(datetime.timezone.utc).isoformat()
            content = synapse.query or ""
            role = (synapse.filters or {}).get("_role", "user")
            retrieval.add_chunk(
                session_id=synapse.session_id,
                content=content,
                embedding=synapse.embedding or [],
                metadata={
                    "id": chunk_id,
                    "role": role,
                    "timestamp": ts,
                    "tier": synapse.tier,
                    "multimodal_type": synapse.multimodal_type,
                },
            )
            bt.logging.info(f"Stored chunk {chunk_id} ({role}) for session {synapse.session_id}")
            synapse.results = [{
                "id": chunk_id,
                "content": content,
                "role": role,
                "status": "stored",
                "timestamp": ts,
            }]
        else:
            clean_filters = {
                k: v for k, v in (synapse.filters or {}).items()
                if not k.startswith("_")
            }
            synapse.results = retrieval.retrieve(
                session_id=synapse.session_id,
                query=synapse.query,
                embedding=synapse.embedding,
                top_k=synapse.top_k,
                filters=clean_filters,
                tier=synapse.tier,
                as_of_timestamp=synapse.as_of_timestamp,
                version_id=synapse.version_id,
                diff_since=synapse.diff_since,
            )

        # Versioning / provenance hooks (currently minimal).
        synapse.version_diff = None
        synapse.provenance_path = None

        # Workflow checkpoint hooks (no-op for now).
        if synapse.resume_from_checkpoint and synapse.workflow_id:
            synapse.checkpoint = checkpoint.load_checkpoint(
                workflow_id=synapse.workflow_id
            )

        return synapse

    async def blacklist(self, synapse: OpenMindRequest) -> t.Tuple[bool, str]:
        """
        Basic blacklist policy.

        For local development any hotkey registered in the metagraph is allowed.
        In production, tighten this to require ``validator_permit``.
        """
        if self.metagraph is None:
            bt.logging.warning("Metagraph not available; allowing request (local dev).")
            return False, "Metagraph unavailable – allowing"

        if synapse.dendrite is None or synapse.dendrite.hotkey is None:
            bt.logging.warning("Received a request without a dendrite or hotkey.")
            return True, "Missing dendrite or hotkey"

        if synapse.dendrite.hotkey not in self.metagraph.hotkeys:
            bt.logging.trace(
                f"Blacklisting un-registered hotkey {synapse.dendrite.hotkey}"
            )
            return True, "Unrecognized hotkey"

        bt.logging.trace(
            f"Allowing registered hotkey {synapse.dendrite.hotkey}"
        )
        return False, "Hotkey recognized!"

    async def priority(self, synapse: OpenMindRequest) -> float:
        """
        Priority function based on caller stake, identical in spirit to the
        template miner implementation.
        """
        if self.metagraph is None:
            bt.logging.warning("Metagraph not available; zero priority.")
            return 0.0

        if synapse.dendrite is None or synapse.dendrite.hotkey is None:
            bt.logging.warning("Received a request without a dendrite or hotkey.")
            return 0.0

        caller_uid = self.metagraph.hotkeys.index(synapse.dendrite.hotkey)
        priority = float(self.metagraph.S[caller_uid])
        bt.logging.trace(
            f"Prioritizing {synapse.dendrite.hotkey} with value: {priority}"
        )
        return priority


def run() -> None:
    """
    Main entrypoint used by `python neuron.py --role miner`.
    """
    bt.logging.set_debug()

    miner = Miner()

    bt.logging.info(
        f"OpenMind miner initialised "
        f"(netuid={miner.netuid}, endpoint={miner.chain_endpoint})"
    )

    status_parts = []
    status_parts.append(f"subtensor={'OK' if miner.subtensor else 'OFFLINE'}")
    status_parts.append(f"metagraph={'OK' if miner.metagraph else 'UNAVAILABLE'}")
    status_parts.append(f"axon={'OK' if miner.axon else 'UNAVAILABLE'}")
    print(f"[MINER] Init status: {', '.join(status_parts)}")

    if miner.axon is not None:
        try:
            miner.axon.start()
            print(f"[MINER] Axon listening on {miner.axon.ip}:{miner.axon.port}")
        except Exception as e:
            bt.logging.error(f"Failed to start axon: {e}")

    print("[MINER] Running main loop (Ctrl+C to stop)...")
    try:
        while True:
            time.sleep(12)
            if miner.subtensor is not None and miner.metagraph is not None:
                try:
                    miner.metagraph.sync(subtensor=miner.subtensor)
                    bt.logging.info(f"Metagraph synced — n={miner.metagraph.n}")
                except Exception as e:
                    bt.logging.warning(f"Metagraph sync failed: {e}")
    except KeyboardInterrupt:
        print("\n[MINER] Shutting down...")
        if miner.axon is not None:
            try:
                miner.axon.stop()
            except Exception:
                pass


if __name__ == "__main__":
    run()
