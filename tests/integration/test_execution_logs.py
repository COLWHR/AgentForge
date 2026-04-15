from backend.models.constants import ActionType

import pytest
import uuid
from backend.services.execution_log_service import execution_log_service
from backend.models.constants import ExecutionState, TerminationReason
from backend.models.schemas import Action

# Use the same team ID as seeded in conftest
TEST_TEAM_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")

@pytest.mark.asyncio
async def test_execution_logs_lifecycle(db_session):
    execution_id = uuid.uuid4()
    agent_id = uuid.uuid4()
    request_id = str(uuid.uuid4())
    team_id = TEST_TEAM_ID

    # 1. Start execution
    await execution_log_service.start_execution(
        execution_id=execution_id,
        request_id=request_id,
        agent_id=agent_id,
        team_id=team_id
    )

    # 2. Start step
    action = Action(type=ActionType.TOOL_CALL, tool_name="calculator", input_data={"exp": "1+1"})
    await execution_log_service.start_step(
        execution_id=execution_id,
        step_index=1,
        request_id=request_id,
        state_before=ExecutionState.INIT.value
    )

    # 3. Complete step
    from backend.models.schemas import ReactStep, Observation
    step = ReactStep(
        step_index=1,
        thought="I need to calculate",
        action=action,
        observation=Observation(result={"result": 2}),
        state_before=ExecutionState.INIT,
        state_after=ExecutionState.ACTING
    )
    await execution_log_service.complete_step(
        step_log_id=1, # This is a bit brittle if not starting from fresh DB, but setup_database handles it
        step=step,
        execution_id=execution_id
    )

    # 4. Complete execution
    await execution_log_service.complete_execution(
        execution_id=execution_id,
        final_state=ExecutionState.FINISHED.value,
        termination_reason=TerminationReason.SUCCESS.value,
        steps_used=1,
        status="success",
        final_answer="The answer is 2."
    )

    # 5. Retrieve and verify
    log_data = await execution_log_service.get_execution_replay(execution_id, team_id)
    assert log_data is not None
    assert log_data["execution_id"] == str(execution_id)
    assert log_data["status"] == "success"
    assert len(log_data["react_steps"]) == 1
    
    step = log_data["react_steps"][0]
    assert step["step_index"] == 1
    assert step["thought"] == "I need to calculate"
    assert step["action"]["tool_name"] == "calculator"
    assert step["observation"]["result"] == {"result": 2}

@pytest.mark.asyncio
async def test_execution_logs_team_isolation(db_session):
    execution_id = uuid.uuid4()
    agent_id = uuid.uuid4()
    request_id = str(uuid.uuid4())
    team_id = TEST_TEAM_ID
    other_team_id = uuid.uuid4()

    await execution_log_service.start_execution(
        execution_id=execution_id,
        request_id=request_id,
        agent_id=agent_id,
        team_id=team_id
    )

    # Cross-team retrieval should return None
    log_data = await execution_log_service.get_execution_replay(execution_id, other_team_id)
    assert log_data is None
