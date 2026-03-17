"""
UID sampling utilities for the OpenMind validator, mirroring the template's
`template.utils.uids.get_random_uids`.
"""

from __future__ import annotations

from typing import List

import numpy as np


def get_random_uids(self, k: int, exclude_self: bool = True) -> List[int]:
    """
    Sample up to `k` random miner UIDs from the current metagraph,
    excluding the validator's own UID to avoid signature mismatches.
    """
    n = int(self.metagraph.n)
    all_uids = list(range(n))

    if exclude_self:
        try:
            own_hotkey = self.wallet.hotkey.ss58_address
            all_uids = [
                uid for uid in all_uids
                if self.metagraph.hotkeys[uid] != own_hotkey
            ]
        except Exception:
            pass

    k = min(k, len(all_uids))
    if k <= 0:
        return []
    return np.random.choice(all_uids, size=k, replace=False).tolist()

