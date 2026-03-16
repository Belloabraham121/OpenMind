import numpy as np

from openmind.scoring import get_rewards, reward


class RichResp:
    def __init__(
        self,
        storage_ok=False,
        retrieval_recall=0.0,
        version_ok=False,
        checkpoint_ok=False,
        latency_ms=0.0,
    ):
        self.storage_ok = storage_ok
        self.retrieval_recall = retrieval_recall
        self.version_ok = version_ok
        self.checkpoint_ok = checkpoint_ok
        self.latency_ms = latency_ms


def test_rich_metrics_dominate_over_empty_results():
    # Perfect response: all sub-metrics maxed and zero latency.
    resp_best = RichResp(
        storage_ok=True,
        retrieval_recall=1.0,
        version_ok=True,
        checkpoint_ok=True,
        latency_ms=0.0,
    )

    # Poor response: nothing correct and very slow.
    resp_worst = RichResp(
        storage_ok=False,
        retrieval_recall=0.0,
        version_ok=False,
        checkpoint_ok=False,
        latency_ms=5000.0,
    )

    best_score = reward(0, resp_best)
    worst_score = reward(0, resp_worst)

    assert 0.99 <= best_score <= 1.0
    assert 0.0 <= worst_score <= 0.05


def test_get_rewards_batch_shapes():
    responses = [RichResp(storage_ok=True), RichResp(storage_ok=False)]
    rewards = get_rewards(step=0, responses=responses)

    assert isinstance(rewards, np.ndarray)
    assert rewards.shape == (2,)

