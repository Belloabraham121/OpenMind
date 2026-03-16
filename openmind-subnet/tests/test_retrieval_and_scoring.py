import numpy as np

from openmind import retrieval
from openmind.scoring import get_rewards


def test_vector_retrieval_orders_by_similarity():
    session_id = "s1"

    # Two simple 2D embeddings.
    retrieval.add_chunk(session_id, "near", [1.0, 0.0], {})
    retrieval.add_chunk(session_id, "far", [0.0, 1.0], {})

    # Query close to [1, 0]
    results = retrieval.retrieve(
        session_id=session_id,
        query=None,
        embedding=[0.9, 0.1],
        top_k=2,
        filters={},
        tier="basic",
    )

    assert len(results) == 2
    assert results[0]["content"] == "near"
    assert results[0]["score"] >= results[1]["score"]


def test_scoring_based_on_results_presence():
    class Resp:
        def __init__(self, results):
            self.results = results

    responses = [
        Resp(results=[{"content": "x"}]),  # rewarded
        Resp(results=[]),                  # zero
        None,                              # zero
    ]

    rewards = get_rewards(step=0, responses=responses)
    assert rewards.shape == (3,)
    assert rewards[0] == 1.0
    assert rewards[1] == 0.0
    assert rewards[2] == 0.0

