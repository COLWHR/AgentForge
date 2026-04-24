import json
import uuid
from unittest.mock import AsyncMock

import pytest

from backend.core.security import encrypt_api_key
from backend.models.constants import ExecutionStatus, TerminationReason
from backend.models.orm import Agent, AgentOwnership
from backend.models.schemas import AuthContext, GatewayResponse, GatewayToolCall, TokenUsage
from backend.services.agent_runtime_assembler import ResolvedAgentRuntime
from backend.services.execution_log_service import execution_log_service
from backend.services.langgraph_execution_strategy import LangGraphExecutionStrategy

TEST_TEAM_ID = "00000000-0000-0000-0000-000000000001"


def _auth_context() -> AuthContext:
    return AuthContext(
        user_id="user-integration",
        team_id=TEST_TEAM_ID,
        auth_mode="jwt",
        request_id="req-test-engine",
    )


async def _create_agent(db_session, *, supports_tools: bool = True) -> uuid.UUID:
    agent_id = uuid.uuid4()
    db_session.add(
        Agent(
            id=agent_id,
            config={
                "name": "LangGraph Test Agent",
                "description": "Integration test agent",
                "llm_provider_url": "https://example.com/v1",
                "llm_api_key_encrypted": encrypt_api_key("test-key"),
                "llm_model_name": "gpt-4o-mini",
                "runtime_config": {"temperature": 0.0},
                "capability_flags": {"supports_tools": supports_tools},
                "constraints": {"max_steps": 4},
            },
        )
    )
    db_session.add(AgentOwnership(agent_id=agent_id, team_id=uuid.UUID(TEST_TEAM_ID)))
    await db_session.commit()
    return agent_id


async def _create_agent_with_tools(db_session, tools: list[str], *, supports_tools: bool = True) -> uuid.UUID:
    agent_id = uuid.uuid4()
    db_session.add(
        Agent(
            id=agent_id,
            config={
                "name": "LangGraph Test Agent",
                "description": "Integration test agent",
                "llm_provider_url": "https://example.com/v1",
                "llm_api_key_encrypted": encrypt_api_key("test-key"),
                "llm_model_name": "gpt-4o-mini",
                "runtime_config": {"temperature": 0.0},
                "capability_flags": {"supports_tools": supports_tools},
                "constraints": {"max_steps": 4},
                "tools": tools,
            },
        )
    )
    db_session.add(AgentOwnership(agent_id=agent_id, team_id=uuid.UUID(TEST_TEAM_ID)))
    await db_session.commit()
    return agent_id


def _tool_schema(name: str, properties: dict, required: list[str]) -> dict:
    return {
        "type": "function",
        "function": {
            "name": name,
            "description": f"Tool schema for {name}",
            "parameters": {
                "type": "object",
                "properties": properties,
                "required": required,
                "additionalProperties": False,
            },
        },
    }


def _resolved_runtime(
    agent_id: uuid.UUID,
    tool_schemas: list[dict],
    *,
    supports_tools: bool = True,
    configured_tools: list[str] | None = None,
    unresolved_tools: list[str] | None = None,
    requested_tool_names: list[str] | None = None,
    unavailable_requested_tools: list[str] | None = None,
    binding_drift: dict | None = None,
    resolution_source: str = "bindings",
) -> ResolvedAgentRuntime:
    tool_names = [
        str(((tool.get("function") or {}).get("name", ""))).strip()
        for tool in tool_schemas
        if isinstance(tool, dict)
    ]
    return ResolvedAgentRuntime(
        agent_id=str(agent_id),
        agent_config={
            "capability_flags": {"supports_tools": supports_tools},
            "constraints": {"max_steps": 4},
            "tools": configured_tools or [],
        },
        supports_tools=supports_tools,
        tool_schemas=tool_schemas,
        resolved_tool_names=tool_names,
        max_steps=4,
        unresolved_tools=unresolved_tools or [],
        configured_tools=configured_tools or [],
        bound_tool_ids=tool_names,
        requested_tool_names=requested_tool_names or [],
        unavailable_requested_tools=unavailable_requested_tools or [],
        binding_drift=binding_drift or {},
        resolution_source=resolution_source,
    )


@pytest.mark.asyncio
async def test_langgraph_strategy_runs_python_add_tool_and_persists_react_steps(db_session):
    agent_id = await _create_agent(db_session)
    model_gateway = AsyncMock()
    tool_runtime = AsyncMock()
    tool_schemas = [
        _tool_schema(
            "python_add_tool",
            {"a": {"type": "integer"}, "b": {"type": "integer"}},
            ["a", "b"],
        )
    ]
    tool_runtime.resolve_agent_runtime.return_value = _resolved_runtime(agent_id, tool_schemas)
    tool_runtime.execute_tool.return_value = json.dumps({"result": 5})
    model_gateway.call.side_effect = [
        GatewayResponse(
            content="必须调用 python_add_tool 计算结果。",
            token_usage=TokenUsage(total_tokens=11),
            finish_reason="tool_calls",
            tool_calls=[
                GatewayToolCall(
                    id="call-python-add",
                    function_name="python_add_tool",
                    function_arguments='{"a":2,"b":3}',
                )
            ],
        ),
        GatewayResponse(
            content="python_add_tool 已返回 5，所以最终答案是 5。",
            token_usage=TokenUsage(total_tokens=7),
            finish_reason="stop",
        ),
    ]
    strategy = LangGraphExecutionStrategy(
        model_gateway=model_gateway,
        tool_runtime=tool_runtime,
        execution_log_service=execution_log_service,
    )

    result = await strategy.run(
        agent_id=str(agent_id),
        user_input="必须调用 python_add_tool 计算 2+3，不允许直接心算。",
        auth_context=_auth_context(),
        request_id="req-python-add",
    )

    replay = await execution_log_service.get_execution_replay(result.execution_id, team_id=uuid.UUID(TEST_TEAM_ID))
    assert result.status == ExecutionStatus.SUCCEEDED
    assert result.termination_reason == TerminationReason.SUCCESS
    assert "5" in (result.final_answer or "")
    assert replay is not None
    assert replay["react_steps"][0]["action"]["tool_id"] == "python_add_tool"
    assert replay["react_steps"][0]["observation"]["ok"] is True
    assert replay["react_steps"][0]["observation"]["result"] == {"result": 5}


@pytest.mark.asyncio
async def test_langgraph_strategy_runs_echo_tool_with_real_replay(db_session):
    agent_id = await _create_agent(db_session)
    model_gateway = AsyncMock()
    tool_runtime = AsyncMock()
    tool_schemas = [
        _tool_schema("echo_tool", {"text": {"type": "string"}}, ["text"])
    ]
    tool_runtime.resolve_agent_runtime.return_value = _resolved_runtime(agent_id, tool_schemas)
    tool_runtime.execute_tool.return_value = json.dumps({"echo": "hello-agent"})
    model_gateway.call.side_effect = [
        GatewayResponse(
            content="先调用 echo_tool。",
            token_usage=TokenUsage(total_tokens=8),
            finish_reason="tool_calls",
            tool_calls=[
                GatewayToolCall(
                    id="call-echo",
                    function_name="echo_tool",
                    function_arguments='{"text":"hello-agent"}',
                )
            ],
        ),
        GatewayResponse(
            content="echo_tool 输出为 hello-agent。",
            token_usage=TokenUsage(total_tokens=5),
            finish_reason="stop",
        ),
    ]
    strategy = LangGraphExecutionStrategy(
        model_gateway=model_gateway,
        tool_runtime=tool_runtime,
        execution_log_service=execution_log_service,
    )

    result = await strategy.run(
        agent_id=str(agent_id),
        user_input="调用 echo_tool 输出 hello-agent。",
        auth_context=_auth_context(),
        request_id="req-echo",
    )

    replay = await execution_log_service.get_execution_replay(result.execution_id, team_id=uuid.UUID(TEST_TEAM_ID))
    assert result.status == ExecutionStatus.SUCCEEDED
    assert replay is not None
    assert replay["react_steps"][0]["action"]["tool_id"] == "echo_tool"
    assert replay["react_steps"][0]["observation"]["result"] == {"echo": "hello-agent"}


@pytest.mark.asyncio
async def test_langgraph_strategy_turns_tool_failure_into_observation(db_session):
    agent_id = await _create_agent(db_session)
    model_gateway = AsyncMock()
    tool_runtime = AsyncMock()
    tool_schemas = [
        _tool_schema("python_add_tool", {"a": {"type": "integer"}, "b": {"type": "integer"}}, ["a", "b"])
    ]
    tool_runtime.resolve_agent_runtime.return_value = _resolved_runtime(agent_id, tool_schemas)
    tool_runtime.execute_tool.side_effect = RuntimeError("invalid parameters for python_add_tool")
    model_gateway.call.side_effect = [
        GatewayResponse(
            content="先尝试工具。",
            token_usage=TokenUsage(total_tokens=9),
            finish_reason="tool_calls",
            tool_calls=[
                GatewayToolCall(
                    id="call-bad-python-add",
                    function_name="python_add_tool",
                    function_arguments='{"a":"bad","b":3}',
                )
            ],
        ),
        GatewayResponse(
            content="工具执行失败，参数不合法。",
            token_usage=TokenUsage(total_tokens=4),
            finish_reason="stop",
        ),
    ]
    strategy = LangGraphExecutionStrategy(
        model_gateway=model_gateway,
        tool_runtime=tool_runtime,
        execution_log_service=execution_log_service,
    )

    result = await strategy.run(
        agent_id=str(agent_id),
        user_input="故意传非法参数，让工具失败。",
        auth_context=_auth_context(),
        request_id="req-tool-failure",
    )

    replay = await execution_log_service.get_execution_replay(result.execution_id, team_id=uuid.UUID(TEST_TEAM_ID))
    assert result.status == ExecutionStatus.SUCCEEDED
    assert replay is not None
    assert replay["react_steps"][0]["observation"]["ok"] is False
    assert replay["react_steps"][0]["observation"]["error"]["message"] == "invalid parameters for python_add_tool"


@pytest.mark.asyncio
async def test_langgraph_strategy_forces_named_tool_when_user_explicitly_requests_it(db_session):
    agent_id = await _create_agent_with_tools(db_session, ["python_executor"])
    model_gateway = AsyncMock()
    tool_runtime = AsyncMock()
    tool_schemas = [_tool_schema("builtin/python_executor", {"code": {"type": "string"}}, ["code"])]
    tool_runtime.resolve_agent_runtime.return_value = _resolved_runtime(
        agent_id,
        tool_schemas,
        configured_tools=["python_executor"],
        requested_tool_names=["builtin/python_executor"],
    )
    tool_runtime.execute_tool.return_value = json.dumps({"sum": 15, "max": 5})
    model_gateway.call.side_effect = [
        GatewayResponse(
            content="需要执行 python_executor。",
            token_usage=TokenUsage(total_tokens=10),
            finish_reason="tool_calls",
            tool_calls=[
                GatewayToolCall(
                    id="call-python-executor",
                    function_name="builtin/python_executor",
                    function_arguments='{"code":"result = {\\"sum\\": sum([1,2,3,4,5]), \\"max\\": max([1,2,3,4,5])}"}',
                )
            ],
        ),
        GatewayResponse(
            content="结果为 sum=15, max=5。",
            token_usage=TokenUsage(total_tokens=6),
            finish_reason="stop",
        ),
    ]
    strategy = LangGraphExecutionStrategy(
        model_gateway=model_gateway,
        tool_runtime=tool_runtime,
        execution_log_service=execution_log_service,
    )

    result = await strategy.run(
        agent_id=str(agent_id),
        user_input='请调用 python_executor 执行以下代码并返回结果：result = {"sum": sum([1,2,3,4,5]), "max": max([1,2,3,4,5])}',
        auth_context=_auth_context(),
        request_id="req-python-executor",
    )

    first_call_kwargs = model_gateway.call.await_args_list[0].kwargs
    replay = await execution_log_service.get_execution_replay(result.execution_id, team_id=uuid.UUID(TEST_TEAM_ID))
    assert first_call_kwargs["tool_choice"] == {"type": "function", "function": {"name": "builtin/python_executor"}}
    assert result.status == ExecutionStatus.SUCCEEDED
    assert replay is not None
    assert replay["react_steps"][0]["action"]["tool_id"] == "builtin/python_executor"
    assert replay["react_steps"][0]["observation"]["result"] == {"sum": 15, "max": 5}


@pytest.mark.asyncio
async def test_langgraph_strategy_fails_when_requested_tool_is_unavailable(db_session):
    agent_id = await _create_agent_with_tools(db_session, ["python_executor"])
    model_gateway = AsyncMock()
    tool_runtime = AsyncMock()
    tool_runtime.resolve_agent_runtime.return_value = _resolved_runtime(
        agent_id,
        [],
        configured_tools=["python_executor"],
        requested_tool_names=["builtin/python_executor"],
        unavailable_requested_tools=["builtin/python_executor"],
        binding_drift={"config_only": ["builtin/python_executor"]},
        resolution_source="binding_drift",
    )
    strategy = LangGraphExecutionStrategy(
        model_gateway=model_gateway,
        tool_runtime=tool_runtime,
        execution_log_service=execution_log_service,
    )

    result = await strategy.run(
        agent_id=str(agent_id),
        user_input="请调用 python_executor 计算 1+1。",
        auth_context=_auth_context(),
        request_id="req-missing-runtime-tool",
    )

    assert result.status == ExecutionStatus.FAILED
    assert "未绑定这些工具" in (result.final_answer or "")
    model_gateway.call.assert_not_called()
