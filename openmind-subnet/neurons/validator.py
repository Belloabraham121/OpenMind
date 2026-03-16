"""
Validator entrypoint for the OpenMind subnet.

Concrete implementation of a Bittensor validator that queries miners using the
`OpenMindRequest` synapse and scores them using `openmind.scoring`.
"""

from __future__ import annotations

import time
from typing import List

import bittensor as bt

from template.base.validator import BaseValidatorNeuron

from openmind.protocol import OpenMindRequest
from openmind.scoring import get_rewards
from openmind.utils.uids import get_random_uids


class Validator(BaseValidatorNeuron):
    """
    OpenMind validator neuron.
    """

    async def forward(self):
        """
        Validator forward pass modelled after the template's forward loop.
        - Samples a set of miner UIDs.
        - Builds an `OpenMindRequest`.
        - Queries miners via dendrite.
        - Scores responses and updates moving-average scores.
        """
        # Sample which miners to query.
        miner_uids: List[int] = get_random_uids(
            self, k=self.config.neuron.sample_size
        )

        # Build a simple request for this step.
        synapse = OpenMindRequest(
            session_id=f"validator-session-{self.wallet.hotkey.ss58_address}",
            query=f"step-{self.step}",
            top_k=10,
        )

        # Query selected miner axons.
        responses = await self.dendrite(
            axons=[self.metagraph.axons[uid] for uid in miner_uids],
            synapse=synapse,
            deserialize=True,
        )

        bt.logging.info(f"Received responses: {responses}")

        # Compute rewards based on responses.
        rewards = get_rewards(
            step=self.step,
            responses=responses,
        )

        bt.logging.info(f"Scored responses: {rewards}")

        # Update scores and sleep for a bit.
        self.update_scores(rewards, miner_uids)
        time.sleep(5)


def run() -> None:
    """
    Main entrypoint used by `python neuron.py --role validator`.
    """
    with Validator() as validator:
        while True:
            bt.logging.info(f"OpenMind validator running... {time.time()}")
            time.sleep(5)


