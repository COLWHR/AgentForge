import json
import uuid
from unittest.mock import AsyncMock, patch

import pytest

from backend.models.constants import ExecutionStatus, TerminationReason
from backend.models.schemas import AgentRead, AuthContext, GatewayResponse, GatewayToolCall, ModelConfig, TokenUsage
from backend.services.execution_engine import ExecutionEngine

TEST_TEAM_ID = "00000000-0000-0000-0000-000000000001"


def _auth_context() -> AuthContext:
    return AuthContext(
        user_id="user-integration",
        team_id=TEST_TEAM_ID,
        auth_mode="jwt",
        request_id="req-test-engine",
    )


def _agent(agent_id: uuid.UUID) -> AgentRead:
    return AgentRead(
        id=agent_id,
        system_prompt="ignored-by-fixed-template",
        model_config=ModelConfig(model="gpt-4o-mini", temperature=0.0),
        tools=[],
        constraints={},
    )


@pytest.mark.asyncio
async def test_react_case_read_file_and_summarize():
    engine = ExecutionEngine()
    aid = uuid.uuid4()
    with patch("backend.services.execution_engine.agent_service.get_agent", new_callable=AsyncMock) as mock_get_agent, \
         patch("backend.services.execution_engine.marketplace_tool_adapter.get_tools_schema", new_callable=AsyncMock) as mock_tools, \
         patch("backend.services.execution_engine.marketplace_tool_adapter.execute_tool", new_callable=AsyncMock) as mock_exec, \
         patch("backend.services.execution_engine.model_gateway.call", new_callable=AsyncMock) as mock_call, \
         patch("backend.services.execution_engine.execution_log_service.start_execution", new_callable=AsyncMock), \
         patch("backend.services.execution_engine.execution_log_service.complete_execution", new_callable=AsyncMock):
        mock_get_agent.return_value = _agent(aid)
        mock_tools.return_value = [{"type": "function", "function": {"name": "filesystem/read_file", "parameters": {"type": "object"}}}]
        mock_exec.return_value = json.dumps({"content": "hello world"})
        mock_call.side_effect = [
            GatewayResponse(
                content="",
                token_usage=TokenUsage(total_tokens=10),
                tool_call=GatewayToolCall(function_name="filesystem/read_file", function_arguments='{"path":"a.txt"}'),
            ),
            GatewayResponse(content="Summary: hello world", token_usage=TokenUsage(total_tokens=5)),
        ]

        result = await engine.run(str(aid), "read and summarize", _auth_context())
        assert result.status == ExecutionStatus.SUCCEEDED
        assert result.termination_reason == TerminationReason.SUCCESS
        assert "Summary" in result.final_answer


@pytest.mark.asyncio
async def test_react_case_create_file():
    engine = ExecutionEngine()
    aid = uuid.uuid4()
    with patch("backend.services.execution_engine.agent_service.get_agent", new_callable=AsyncMock) as mock_get_agent, \
         patch("backend.services.execution_engine.marketplace_tool_adapter.get_tools_schema", new_callable=AsyncMock) as mock_tools, \
         patch("backend.services.execution_engine.marketplace_tool_adapter.execute_tool", new_callable=AsyncMock) as mock_exec, \
         patch("backend.services.execution_engine.model_gateway.call", new_callable=AsyncMock) as mock_call, \
         patch("backend.services.execution_engine.execution_log_service.start_execution", new_callable=AsyncMock), \
         patch("backend.services.execution_engine.execution_log_service.complete_execution", new_callable=AsyncMock):
        mock_get_agent.return_value = _agent(aid)
        mock_tools.return_value = [{"type": "function", "function": {"name": "filesystem/write_file", "parameters": {"type": "object"}}}]
        mock_exec.return_value = json.dumps({"ok": True})
        mock_call.side_effect = [
            GatewayResponse(
                content="",
                token_usage=TokenUsage(total_tokens=10),
                tool_call=GatewayToolCall(
                    function_name="filesystem/write_file",
                    function_arguments='{"path":"new.txt","content":"abc"}',
                ),
            ),
            GatewayResponse(content="Created file: new.txt", token_usage=TokenUsage(total_tokens=5)),
        ]

        result = await engine.run(str(aid), "create file", _auth_context())
        assert result.status == ExecutionStatus.SUCCEEDED
        mock_exec.assert_called_once()
        called_args = mock_exec.await_args.kwargs["arguments"]
        assert called_args["path"] == "new.txt"


@pytest.mark.asyncio
async def test_react_case_modify_file_read_then_write():
    engine = ExecutionEngine()
    aid = uuid.uuid4()
    with patch("backend.services.execution_engine.agent_service.get_agent", new_callable=AsyncMock) as mock_get_agent, \
         patch("backend.services.execution_engine.marketplace_tool_adapter.get_tools_schema", new_callable=AsyncMock) as mock_tools, \
         patch("backend.services.execution_engine.marketplace_tool_adapter.execute_tool", new_callable=AsyncMock) as mock_exec, \
         patch("backend.services.execution_engine.model_gateway.call", new_callable=AsyncMock) as mock_call, \
         patch("backend.services.execution_engine.execution_log_service.start_execution", new_callable=AsyncMock), \
         patch("backend.services.execution_engine.execution_log_service.complete_execution", new_callable=AsyncMock):
        mock_get_agent.return_value = _agent(aid)
        mock_tools.return_value = [
            {"type": "function", "function": {"name": "filesystem/read_file", "parameters": {"type": "object"}}},
            {"type": "function", "function": {"name": "filesystem/write_file", "parameters": {"type": "object"}}},
        ]
        mock_exec.side_effect = [json.dumps({"content": "old"}), json.dumps({"ok": True})]
        mock_call.side_effect = [
            GatewayResponse(
                content="",
                token_usage=TokenUsage(total_tokens=10),
                tool_call=GatewayToolCall(function_name="filesystem/read_file", function_arguments='{"path":"a.txt"}'),
            ),
            GatewayResponse(
                content="",
                token_usage=TokenUsage(total_tokens=10),
                tool_call=GatewayToolCall(
                    function_name="filesystem/write_file",
                    function_arguments='{"path":"a.txt","content":"new"}',
                ),
            ),
            GatewayResponse(content="Modified file: a.txt", token_usage=TokenUsage(total_tokens=5)),
        ]

        result = await engine.run(str(aid), "modify file", _auth_context())
        assert result.status == ExecutionStatus.SUCCEEDED
        calls = mock_exec.await_args_list
        assert calls[0].kwargs["tool_id"] == "filesystem/read_file"
        assert calls[1].kwargs["tool_id"] == "filesystem/write_file"


@pytest.mark.asyncio
async def test_react_case_retry_then_final_answer():
    engine = ExecutionEngine()
    aid = uuid.uuid4()
    with patch("backend.services.execution_engine.agent_service.get_agent", new_callable=AsyncMock) as mock_get_agent, \
         patch("backend.services.execution_engine.marketplace_tool_adapter.get_tools_schema", new_callable=AsyncMock) as mock_tools, \
         patch("backend.services.execution_engine.marketplace_tool_adapter.execute_tool", new_callable=AsyncMock) as mock_exec, \
         patch("backend.services.execution_engine.model_gateway.call", new_callable=AsyncMock) as mock_call, \
         patch("backend.services.execution_engine.execution_log_service.start_execution", new_callable=AsyncMock), \
         patch("backend.services.execution_engine.execution_log_service.complete_execution", new_callable=AsyncMock):
        mock_get_agent.return_value = _agent(aid)
        mock_tools.return_value = [{"type": "function", "function": {"name": "filesystem/read_file", "parameters": {"type": "object"}}}]
        mock_exec.side_effect = RuntimeError("tool down")
        mock_call.side_effect = [
            GatewayResponse(
                content="",
                token_usage=TokenUsage(total_tokens=10),
                tool_call=GatewayToolCall(function_name="filesystem/read_file", function_arguments='{"path":"a.txt"}'),
            ),
            GatewayResponse(content="Tool failed, cannot continue.", token_usage=TokenUsage(total_tokens=5)),
        ]

        result = await engine.run(str(aid), "read file", _auth_context())
        assert mock_exec.await_count == 2
        assert result.final_answer == "Tool failed, cannot continue."


@pytest.mark.asyncio
async def test_react_case_loop_protection_triggered():
    engine = ExecutionEngine()
    aid = uuid.uuid4()
    with patch("backend.services.execution_engine.agent_service.get_agent", new_callable=AsyncMock) as mock_get_agent, \
         patch("backend.services.execution_engine.marketplace_tool_adapter.get_tools_schema", new_callable=AsyncMock) as mock_tools, \
         patch("backend.services.execution_engine.marketplace_tool_adapter.execute_tool", new_callable=AsyncMock) as mock_exec, \
         patch("backend.services.execution_engine.model_gateway.call", new_callable=AsyncMock) as mock_call, \
         patch("backend.services.execution_engine.execution_log_service.start_execution", new_callable=AsyncMock), \
         patch("backend.services.execution_engine.execution_log_service.complete_execution", new_callable=AsyncMock):
        mock_get_agent.return_value = _agent(aid)
        mock_tools.return_value = [{"type": "function", "function": {"name": "filesystem/list_dir", "parameters": {"type": "object"}}}]
        mock_exec.return_value = json.dumps({"items": ["a.txt"]})
        mock_call.side_effect = [
            GatewayResponse(
                content="",
                token_usage=TokenUsage(total_tokens=10),
                tool_call=GatewayToolCall(function_name="filesystem/list_dir", function_arguments='{"path":"."}'),
            ),
            GatewayResponse(
                content="",
                token_usage=TokenUsage(total_tokens=10),
                tool_call=GatewayToolCall(function_name="filesystem/list_dir", function_arguments='{"path":"."}'),
            ),
        ]

        result = await engine.run(str(aid), "list dir", _auth_context())
        assert result.status == ExecutionStatus.TERMINATED
        assert "Loop Protection" in result.final_answer
