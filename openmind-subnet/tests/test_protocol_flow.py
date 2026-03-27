from openmind.protocol import OpenMindRequest
from openmind import retrieval


def test_request_deserialize_propagates_results():
    session_id = "s-protocol"

    # Seed retrieval index with one clearly best match.
    retrieval.add_chunk(session_id, "best", [1.0, 0.0], {"tag": "keep"})
    retrieval.add_chunk(session_id, "worse", [0.0, 1.0], {"tag": "keep"})

    req = OpenMindRequest(
        session_id=session_id,
        query=None,
        embedding=[0.9, 0.1],
        top_k=1,
        filters={"tag": "keep"},
    )

    req.results = retrieval.retrieve(
        session_id=req.session_id,
        query=req.query,
        embedding=req.embedding,
        top_k=req.top_k,
        filters=req.filters,
    )

    resp = req.deserialize()

    assert len(resp.results) == 1
    assert resp.results[0]["content"] == "best"

