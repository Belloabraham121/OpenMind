from openmind.versioning import (
    create_version,
    get_version_chain,
    get_version_by_id,
    diff_versions,
)


def test_version_chain_and_ids():
    session_id = "sess-v1"
    payload1 = b"state-1"
    payload2 = b"state-2"

    v1 = create_version(session_id, payload1, author="alice", change_reason="init")
    v2 = create_version(
        session_id,
        payload2,
        author="alice",
        change_reason="update",
        parent_version_id=v1.version_id,
    )

    chain = get_version_chain(session_id)
    assert [v.version_id for v in chain] == [v1.version_id, v2.version_id]

    fetched = get_version_by_id(session_id, v2.version_id)
    assert fetched is not None
    assert fetched.version_id == v2.version_id
    assert fetched.parent_version_id == v1.version_id


def test_diff_versions_added_ids():
    session_id = "sess-v2"

    v1 = create_version(session_id, b"a")
    v2 = create_version(session_id, b"b", parent_version_id=v1.version_id)
    v3 = create_version(session_id, b"c", parent_version_id=v2.version_id)

    diff = diff_versions(session_id, from_version_id=v1.version_id, to_version_id=v3.version_id)
    assert diff["added"] == [v2.version_id, v3.version_id]
    assert diff["removed"] == []

