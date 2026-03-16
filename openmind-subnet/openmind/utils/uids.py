"""
UID sampling utilities for the OpenMind validator, mirroring the template's
`template.utils.uids.get_random_uids`.
"""

from __future__ import annotations

from typing import List

import numpy as np


def get_random_uids(self, k: int) -> List[int]:
    """
    Sample up to `k` random UIDs from the current metagraph.
    """
    n = int(self.metagraph.n)
    k = min(k, n)
    if k <= 0 or n == 0:
        return []
    return np.random.choice(n, size=k, replace=False).tolist()

