import pytest

import asyncio
import json
import uuid
from unittest.mock import AsyncMock, patch

from backend.core.tool_runtime import ToolExecutor
from backend.core.tools import EchoTool, PythonAddTool
from backend.models.constants import ExecutionState
from backend.models.schemas import AgentRead, ModelConfig, GatewayResponse, TokenUsage
from backend.models.tool import ToolSuccessResponse, ToolFailureResponse, ToolError
from backend.models.tool_runtime_errors import ToolRuntimeErrorCode
from backend.services.execution_engine import ExecutionEngine

# Use the same team ID as seeded in conftest
TEST_TEAM_ID = "00000000-0000-0000-0000-000000000001"

def test_tool_runtime_normal_tool_success():
    tool = EchoTool()
    with patch("backend.core.tool_runtime.ToolRegistry.get_tool", return_value=tool):
        resp = ToolExecutor.execute(
            name="echo_tool",
            input_data={"x": 1},
            request_id="req-normal-tool"
        )
    assert isinstance(resp, ToolSuccessResponse)
    assert resp.ok is True
    assert resp.data == {"y": 2}


def test_tool_runtime_python_tool_success():
    tool = PythonAddTool()
    with patch("backend.core.tool_runtime.ToolRegistry.get_tool", return_value=tool), patch(
        "backend.core.tools.sandbox_service.execute_python",
        return_value={"observation": {"value": 3}}
    ):
        resp = ToolExecutor.execute(
            name="python_add_tool",
            input_data={"x": 2},
            request_id="req-python-tool-success"
        )
    assert isinstance(resp, ToolSuccessResponse)
    assert resp.ok is True
    assert resp.data == {"observation": {"value": 3}}


def test_tool_runtime_sandbox_error_to_failure_response():
    tool = PythonAddTool()
    with patch("backend.core.tool_runtime.ToolRegistry.get_tool", return_value=tool), patch(
        "backend.core.tools.sandbox_service.execute_python",
        return_value={"observation": {"error": "division by zero"}}
    ):
        resp = ToolExecutor.execute(
            name="python_add_tool",
            input_data={"x": 2},
            request_id="req-sandbox-error"
        )
    assert isinstance(resp, ToolFailureResponse)
    assert resp.ok is False
    assert resp.error.code == ToolRuntimeErrorCode.SANDBOX_ERROR
    assert "division by zero" in resp.error.message


@pytest.mark.asyncio
async def test_engine_compat_with_tool_failure():
    engine = ExecutionEngine()
    agent = AgentRead(
        id=uuid.uuid4(),
        system_prompt="You are a helpful assistant.",
        model_config=ModelConfig(model="gpt-3.5-turbo", temperature=0.7),
        tools=["python_add_tool"],
        constraints={"max_steps": 2}
    )
    gateway_tool_call = GatewayResponse(
        content=json.dumps({
            "thought": "Call tool.",
            "action": {
                "type": "tool_call",
                "tool_name": "python_add_tool",
                "input_data": {"x": 2}
            }
        }),
        token_usage=TokenUsage(prompt_tokens=5, completion_tokens=5, total_tokens=10)
    )
    gateway_finish = GatewayResponse(
        content=json.dumps({
            "thought": "Handle error then finish.",
            "action": {
                "type": "finish",
                "final_answer": "done"
            }
        }),
        token_usage=TokenUsage(prompt_tokens=4, completion_tokens=4, total_tokens=8)
    )
    runtime_failure = ToolFailureResponse(
        error=ToolError(
            code=ToolRuntimeErrorCode.SANDBOX_ERROR,
            message="Sandbox execution failed: division by zero"
        )
    )
    with patch("backend.services.execution_engine.model_gateway.chat", new_callable=AsyncMock) as mock_chat, \
         patch("backend.services.execution_engine.ToolExecutor.execute", return_value=runtime_failure), \
         patch("backend.services.execution_engine.execution_log_service.start_execution", new_callable=AsyncMock), \
         patch("backend.services.execution_engine.execution_log_service.start_step", new_callable=AsyncMock), \
         patch("backend.services.execution_engine.execution_log_service.complete_step", new_callable=AsyncMock), \
         patch("backend.services.execution_engine.execution_log_service.complete_execution", new_callable=AsyncMock):
        mock_chat.side_effect = [gateway_tool_call, gateway_finish]
        result = await engine.run(agent, "trigger sandbox failure", team_id=TEST_TEAM_ID)
    assert result.final_state == ExecutionState.FINISHED
    assert result.execution_trace[0].observation.error == "Sandbox execution failed: division by zero"
    assert result.execution_trace[0].error is not None
    assert result.execution_trace[0].error.error_source == "tool"
    assert result.execution_trace[0].error.error_code == str(ToolRuntimeErrorCode.SANDBOX_ERROR.value)
