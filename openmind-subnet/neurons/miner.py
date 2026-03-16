"""
Miner entrypoint for the OpenMind subnet.

Concrete implementation of a Bittensor miner that serves the `OpenMindRequest`
synapse defined in `openmind.protocol`.
"""

from __future__ import annotations

import time
import typing as t

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

        # Standard Bittensor components (using SDK v10 classes).
        self.wallet = bt.Wallet(config=self.config)

        try:
            self.subtensor = bt.Subtensor(config=self.config)
        except Exception as e:  # pragma: no cover - environment dependent
            bt.logging.error(f"Failed to create Subtensor for miner: {e}")
            self.subtensor = None

        if self.subtensor is not None:
            try:
                self.metagraph = self.subtensor.metagraph(netuid=self.config.netuid)
            except Exception as e:  # pragma: no cover - environment dependent
                bt.logging.error(f"Failed to sync metagraph for miner: {e}")
                self.metagraph = None
        else:
            self.metagraph = None

        # Axon that will serve OpenMind requests. In constrained environments
        # this may fail (e.g. when trying to discover external IP); we handle
        # that gracefully and allow offline-only operation.
        try:
            self.axon = bt.Axon(
                wallet=self.wallet,
                config=self.config,
            )
            self.axon.attach(
                forward_fn=self.forward,
                blacklist_fn=self.blacklist,
                priority_fn=self.priority,
            )
        except Exception as e:  # pragma: no cover - environment dependent
            bt.logging.error(f"Failed to create Axon for miner: {e}")
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

        # TODO: integrate real encrypted storage + RS durability.
        # For now, retrieval is a thin wrapper around a stubbed implementation.
        synapse.results = retrieval.retrieve(
            session_id=synapse.session_id,
            query=synapse.query,
            embedding=synapse.embedding,
            top_k=synapse.top_k,
            filters=synapse.filters,
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
        Basic blacklist policy modelled after the template miner.
        """
        if self.metagraph is None:
            bt.logging.warning("Metagraph not available; blacklisting by default.")
            return True, "Metagraph unavailable"

        if synapse.dendrite is None or synapse.dendrite.hotkey is None:
            bt.logging.warning("Received a request without a dendrite or hotkey.")
            return True, "Missing dendrite or hotkey"

        uid = self.metagraph.hotkeys.index(synapse.dendrite.hotkey)

        # Simple policy: only allow registered validators.
        if synapse.dendrite.hotkey not in self.metagraph.hotkeys:
            bt.logging.trace(
                f"Blacklisting un-registered hotkey {synapse.dendrite.hotkey}"
            )
            return True, "Unrecognized hotkey"

        if not self.metagraph.validator_permit[uid]:
            bt.logging.warning(
                f"Blacklisting a request from non-validator hotkey {synapse.dendrite.hotkey}"
            )
            return True, "Non-validator hotkey"

        bt.logging.trace(
            f"Not blacklisting recognized validator hotkey {synapse.dendrite.hotkey}"
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

    This function configures and serves a minimal axon without relying on the
    Bittensor template base miner.
    """
    miner = Miner()

    # If we could not create a Subtensor client, just start the axon locally
    # without attempting to register on-chain. This avoids runtime errors in
    # environments without chain access.
    if miner.subtensor is not None and miner.axon is not None:  # pragma: no branch
        try:
            miner.subtensor.serve_axon(
                netuid=miner.config.netuid,
                axon=miner.axon,
            )
        except Exception as e:  # pragma: no cover - environment dependent
            bt.logging.error(f"Failed to serve axon on-chain: {e}")

    if miner.axon is not None:
        try:
            miner.axon.start()
        except Exception as e:  # pragma: no cover - environment dependent
            bt.logging.error(f"Failed to start axon: {e}")

    bt.logging.info("OpenMind miner started (may be offline-only if chain unavailable).")

    try:
        while True:
            bt.logging.info(f"OpenMind miner running... {time.time()}")
            time.sleep(5)
    except KeyboardInterrupt:
        bt.logging.info("OpenMind miner shutting down.")
        if miner.axon is not None:  # pragma: no branch
            try:
                miner.axon.stop()
            except Exception as e:  # pragma: no cover - environment dependent
                bt.logging.error(f"Error while stopping axon: {e}")



