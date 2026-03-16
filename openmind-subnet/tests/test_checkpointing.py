from openmind.checkpoint import save_checkpoint, load_checkpoint


def test_save_and_load_specific_step():
    workflow_id = "wf-123"
    state = {"variables": {"x": 1}, "tool_results": [], "decisions": ["start"]}

    save_checkpoint(workflow_id=workflow_id, step=1, state=state)

    loaded = load_checkpoint(workflow_id=workflow_id, step=1)
    assert loaded is not None
    assert loaded["workflow_id"] == workflow_id
    assert loaded["step"] == 1
    assert loaded["state"] == state


def test_load_latest_when_step_not_specified():
    workflow_id = "wf-456"

    save_checkpoint(workflow_id=workflow_id, step=1, state={"step": 1})
    save_checkpoint(workflow_id=workflow_id, step=2, state={"step": 2})

    latest = load_checkpoint(workflow_id=workflow_id)
    assert latest is not None
    assert latest["step"] == 2
    assert latest["state"] == {"step": 2}

