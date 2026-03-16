"""
Miner entrypoint for the OpenMind subnet.

Concrete implementation of a Bittensor miner that serves the `OpenMindRequest`
synapse defined in `openmind.protocol`.
"""

from __future__ import annotations

import time
import typing as t

import bittensor as bt

from template.base.miner import BaseMinerNeuron

from openmind.protocol import OpenMindRequest
from openmind import retrieval, storage, durability, versioning, checkpoint, shared_space


class Miner(BaseMinerNeuron):
    """
    OpenMind miner neuron.

    Handles incoming `OpenMindRequest` synapses and returns enriched responses
    containing retrieval results, versioning info, and optional checkpoints.
    """

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
        if synapse.dendrite is None or synapse.dendrite.hotkey is None:
            bt.logging.warning("Received a request without a dendrite or hotkey.")
            return True, "Missing dendrite or hotkey"

        uid = self.metagraph.hotkeys.index(synapse.dendrite.hotkey)

        if (
            not self.config.blacklist.allow_non_registered
            and synapse.dendrite.hotkey not in self.metagraph.hotkeys
        ):
            bt.logging.trace(
                f"Blacklisting un-registered hotkey {synapse.dendrite.hotkey}"
            )
            return True, "Unrecognized hotkey"

        if self.config.blacklist.force_validator_permit:
            if not self.metagraph.validator_permit[uid]:
                bt.logging.warning(
                    f"Blacklisting a request from non-validator hotkey {synapse.dendrite.hotkey}"
                )
                return True, "Non-validator hotkey"

        bt.logging.trace(f"Not blacklisting recognized hotkey {synapse.dendrite.hotkey}")
        return False, "Hotkey recognized!"

    async def priority(self, synapse: OpenMindRequest) -> float:
        """
        Priority function based on caller stake, identical in spirit to the
        template miner implementation.
        """
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
    with Miner() as miner:
        while True:
            bt.logging.info(f"OpenMind miner running... {time.time()}")
            time.sleep(5)


