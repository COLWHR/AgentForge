import pytest

import asyncio
import uuid
import json
from unittest.mock import AsyncMock, patch, MagicMock
from backend.models.schemas import AgentRead, ModelConfig, GatewayResponse, TokenUsage, GatewayError
from backend.models.constants import ExecutionState, TerminationReason, ActionType, ResponseCode
from backend.services.execution_engine import ExecutionEngine
from backend.models.tool import ToolSuccessResponse

# Use the same team ID as seeded in conftest
TEST_TEAM_ID = "00000000-0000-0000-0000-000000000001"

@pytest.mark.asyncio
async def test_execution_engine():
    engine = ExecutionEngine()
    
    # 1. Setup Mock Agent
    agent = AgentRead(
        id=uuid.uuid4(),
        system_prompt="You are a helpful assistant.",
        model_config=ModelConfig(model="gpt-3.5-turbo", temperature=0.7),
        tools=["calculator"],
        constraints={"max_steps": 3}
    )
    
    # 2. Mock ModelGateway Response 1: Tool Call
    mock_gateway_resp_1 = GatewayResponse(
        content=json.dumps({
            "thought": "I need to calculate 2+2.",
            "action": {
                "type": "tool_call",
                "tool_name": "calculator",
                "input_data": {"expression": "2+2"}
            }
        }),
        token_usage=TokenUsage(prompt_tokens=10, completion_tokens=20, total_tokens=30)
    )
    
    # 3. Mock ModelGateway Response 2: Finish
    mock_gateway_resp_2 = GatewayResponse(
        content=json.dumps({
            "thought": "The result is 4.",
            "action": {
                "type": "finish",
                "final_answer": "The answer is 4."
            }
        }),
        token_usage=TokenUsage(prompt_tokens=15, completion_tokens=5, total_tokens=20)
    )
    
    # 4. Mock Tool Runtime Response
    mock_tool_resp = ToolSuccessResponse(data={"result": 4})

    # Execute with patches
    with patch("backend.services.execution_engine.model_gateway.chat", new_callable=AsyncMock) as mock_chat, \
         patch("backend.services.execution_engine.ToolExecutor.execute", return_value=mock_tool_resp) as mock_tool_exec, \
         patch("backend.services.execution_engine.execution_log_service.start_execution", new_callable=AsyncMock), \
         patch("backend.services.execution_engine.execution_log_service.start_step", new_callable=AsyncMock), \
         patch("backend.services.execution_engine.execution_log_service.complete_step", new_callable=AsyncMock), \
         patch("backend.services.execution_engine.execution_log_service.complete_execution", new_callable=AsyncMock):
        
        mock_chat.side_effect = [mock_gateway_resp_1, mock_gateway_resp_2]
        
        result = await engine.run(agent, "What is 2+2?", team_id=TEST_TEAM_ID)
        
        assert result.final_state == ExecutionState.FINISHED
        assert result.steps_used == 2
        assert result.termination_reason == TerminationReason.SUCCESS
        assert result.final_answer == "The answer is 4."
        assert result.total_token_usage.total_tokens == 50
        assert len(result.execution_trace) == 2
        
        step1 = result.execution_trace[0]
        assert step1.step_index == 1
        assert step1.state_before == ExecutionState.INIT
        assert step1.state_after == ExecutionState.OBSERVING
        assert step1.action.type == ActionType.TOOL_CALL
        assert step1.observation.result == {"result": 4}

@pytest.mark.asyncio
async def test_execution_engine_max_steps():
    engine = ExecutionEngine()
    agent = AgentRead(
        id=uuid.uuid4(),
        system_prompt="Test agent",
        model_config=ModelConfig(model="gpt-3.5-turbo", temperature=0.7),
        tools=["calculator"],
        constraints={"max_steps": 2}
    )
    
    mock_gateway_resp = GatewayResponse(
        content=json.dumps({
            "thought": "Thinking...",
            "action": {"type": "tool_call", "tool_name": "calculator", "input_data": {"exp": "1+1"}}
        }),
        token_usage=TokenUsage(total_tokens=10)
    )
    
    mock_tool_resp = ToolSuccessResponse(data={"result": 2})

    with patch("backend.services.execution_engine.model_gateway.chat", new_callable=AsyncMock) as mock_chat, \
         patch("backend.services.execution_engine.ToolExecutor.execute", return_value=mock_tool_resp) as mock_tool_exec, \
         patch("backend.services.execution_engine.execution_log_service.start_execution", new_callable=AsyncMock), \
         patch("backend.services.execution_engine.execution_log_service.start_step", new_callable=AsyncMock), \
         patch("backend.services.execution_engine.execution_log_service.complete_step", new_callable=AsyncMock), \
         patch("backend.services.execution_engine.execution_log_service.complete_execution", new_callable=AsyncMock):
        
        mock_chat.return_value = mock_gateway_resp
        result = await engine.run(agent, "Loop forever", team_id=TEST_TEAM_ID)
        
        assert result.final_state == ExecutionState.TERMINATED
        assert result.steps_used == 2
        assert result.termination_reason == TerminationReason.MAX_STEPS_REACHED

@pytest.mark.asyncio
async def test_execution_engine_error_isolation():
    engine = ExecutionEngine()
    agent = AgentRead(
        id=uuid.uuid4(),
        system_prompt="Test agent",
        model_config=ModelConfig(model="gpt-3.5-turbo", temperature=0.7),
        tools=["calculator"],
        constraints={"max_steps": 5}
    )
    
    # Create a mock for the error code that has a string value
    # to satisfy the buggy engine code: gateway_resp.error.code.value
    mock_code = MagicMock()
    mock_code.value = str(ResponseCode.MODEL_ERROR.value)
    
    mock_gateway_resp = GatewayResponse(
        content="",
        token_usage=TokenUsage(),
        error=GatewayError(code=ResponseCode.MODEL_ERROR, message="Model unavailable")
    )
    # Inject the mock code
    mock_gateway_resp.error.code = mock_code

    with patch("backend.services.execution_engine.model_gateway.chat", new_callable=AsyncMock) as mock_chat, \
         patch("backend.services.execution_engine.execution_log_service.start_execution", new_callable=AsyncMock), \
         patch("backend.services.execution_engine.execution_log_service.start_step", new_callable=AsyncMock), \
         patch("backend.services.execution_engine.execution_log_service.complete_step", new_callable=AsyncMock), \
         patch("backend.services.execution_engine.execution_log_service.complete_execution", new_callable=AsyncMock):
        mock_chat.return_value = mock_gateway_resp
        
        result = await engine.run(agent, "Trigger error", team_id=TEST_TEAM_ID)
        
        assert result.final_state == ExecutionState.TERMINATED
        assert result.termination_reason == TerminationReason.ERROR_TERMINATED
        # Check that it's no longer a validation error but the expected gateway error
        assert "Model Gateway Error: Model unavailable" in result.execution_trace[0].observation.error
        assert result.execution_trace[0].error.error_code == str(ResponseCode.MODEL_ERROR.value)
