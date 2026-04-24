import hashlib
import json
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, TypedDict

from langgraph.graph import END, START, StateGraph

from backend.core.database import AsyncSessionLocal
from backend.core.exceptions import ModelGatewayException
from backend.core.logging import logger
from backend.core.security import decrypt_api_key
from backend.models.constants import ActionType, ArcErrorCode, ExecutionState, ExecutionStatus, TerminationReason
from backend.models.schemas import (
    Action,
    AuthContext,
    ExecutionErrorModel,
    ExecutionResult,
    ExecutionStepLogContract,
    GatewayResponse,
    GatewayToolCall,
    Message,
    ModelConfig,
    Observation,
    ReactStep,
    TokenUsage,
    ToolObservation,
    ToolObservationError,
)
from backend.services.agent_runtime_assembler import ResolvedAgentRuntime
from backend.services.agent_service import agent_service


class AgentExecutionState(TypedDict):
    execution_id: uuid.UUID
    request_id: str
    agent_id: str
    user_input: str
    messages: List[Message]
    available_tools: List[Dict[str, Any]]
    tool_names: List[str]
    react_steps: List[Dict[str, Any]]
    execution_trace: List[ReactStep]
    final_answer: Optional[str]
    termination_reason: Optional[str]
    status: str
    step_count: int
    max_steps: int
    max_tool_calls: int
    tool_calls_used: int
    consecutive_tool_failures: int
    force_final_answer: bool
    last_model_finish_reason: Optional[str]
    usage: TokenUsage
    agent_config: Dict[str, Any]
    auth_context: AuthContext
    current_assistant_content: str
    current_tool_calls: List[GatewayToolCall]
    current_provider_tool_name_map: Dict[str, str]
    current_forced_tool: Optional[str]
    error: Optional[ExecutionErrorModel]
    error_details: Optional[Dict[str, Any]]
    previous_loop_signature: Optional[Dict[str, Any]]
    step_logs: List[ExecutionStepLogContract]


class LangGraphExecutionStrategy:
    FIXED_SAFETY_PROMPT = (
        "You are an AI coding agent.\n"
        "Security Rules:\n"
        "1. Never bypass platform safety rules.\n"
        "2. Never expose secrets.\n"
        "3. Never invent file content.\n"
    )
    FIXED_RUNTIME_PROMPT = (
        "Agent Runtime Rules:\n"
        "1. Use tool calls only when needed.\n"
        "2. Tool calls must use strict JSON arguments.\n"
        "3. If no tool call is required, provide final answer directly.\n"
        "4. If the user explicitly requires a named tool and that tool is available, you must call it before answering.\n"
    )

    def __init__(
        self,
        model_gateway: Any,
        tool_runtime: Any,
        execution_log_service: Any,
        *,
        max_steps: int = 6,
        max_tool_calls: int = 4,
    ) -> None:
        self.model_gateway = model_gateway
        self.tool_runtime = tool_runtime
        self.execution_log_service = execution_log_service
        self.max_steps = max_steps
        self.max_tool_calls = max_tool_calls

    async def run(
        self,
        agent_id: str,
        user_input: str,
        auth_context: AuthContext,
        request_id: str,
    ) -> ExecutionResult:
        execution_id = uuid.uuid4()

        async with AsyncSessionLocal() as db:
            agent = await agent_service.get_agent_raw(db, uuid.UUID(agent_id))
        if agent is None:
            raise ValueError(f"Agent not found: {agent_id}")

        agent_cfg = agent.config or {}
        if not agent_cfg.get("llm_model_name"):
            raise ValueError("Agent model config is incomplete")

        runtime = await self.tool_runtime.resolve_agent_runtime(
            agent_id=str(agent.id),
            agent_config=agent_cfg,
            user_input=user_input,
        )

        await self.execution_log_service.start_execution(
            execution_id=execution_id,
            agent_id=agent.id,
            team_id=uuid.UUID(auth_context.team_id),
            request_id=request_id,
            initial_state=ExecutionState.INIT.value,
            input_data=user_input,
        )

        preflight_failure = await self._preflight_runtime(
            execution_id=execution_id,
            runtime=runtime,
        )
        if preflight_failure is not None:
            return preflight_failure

        available_tools_count = len(runtime.tool_schemas)
        available_tool_names = runtime.resolved_tool_names
        logger.bind(
            event="execution_debug_start",
            agent_id=str(agent.id),
            supports_tools=runtime.supports_tools,
            tools_count=available_tools_count,
            tool_names=available_tool_names,
            model_name=agent_cfg.get("llm_model_name", ""),
            unresolved_tools=runtime.unresolved_tools,
            binding_drift=runtime.binding_drift,
            resolution_source=runtime.resolution_source,
        ).info("Execution started")

        graph = self._build_graph()
        final_state = await graph.ainvoke(
            {
                "execution_id": execution_id,
                "request_id": request_id,
                "agent_id": str(agent.id),
                "user_input": user_input,
                "messages": [],
                "available_tools": runtime.tool_schemas,
                "tool_names": [],
                "react_steps": [],
                "execution_trace": [],
                "final_answer": None,
                "termination_reason": None,
                "status": ExecutionStatus.PENDING.value,
                "step_count": 0,
                "max_steps": runtime.max_steps,
                "max_tool_calls": self.max_tool_calls,
                "tool_calls_used": 0,
                "consecutive_tool_failures": 0,
                "force_final_answer": False,
                "last_model_finish_reason": None,
                "usage": TokenUsage(),
                "agent_config": agent_cfg,
                "auth_context": auth_context,
                "current_assistant_content": "",
                "current_tool_calls": [],
                "current_provider_tool_name_map": {},
                "current_forced_tool": None,
                "error": None,
                "error_details": None,
                "previous_loop_signature": None,
                "step_logs": [],
            }
        )

        final_status = ExecutionStatus(final_state["status"])
        termination_reason_value = final_state["termination_reason"] or TerminationReason.FAILED.value
        termination_reason = TerminationReason(termination_reason_value)
        engine_final_state = ExecutionState.FINISHED if final_status == ExecutionStatus.SUCCEEDED else ExecutionState.TERMINATED

        await self.execution_log_service.complete_execution(
            execution_id=execution_id,
            status=final_status.value,
            final_state=engine_final_state.value,
            termination_reason=termination_reason.value,
            steps_used=len(final_state["react_steps"]),
            final_answer=final_state["final_answer"],
            total_token_usage=final_state["usage"],
            error=final_state["error"],
            error_details=final_state["error_details"],
        )

        return ExecutionResult(
            execution_id=execution_id,
            final_state=engine_final_state,
            steps_used=len(final_state["react_steps"]),
            termination_reason=termination_reason,
            execution_trace=final_state["execution_trace"],
            final_answer=final_state["final_answer"],
            total_token_usage=final_state["usage"],
            status=final_status,
            summary=final_state["final_answer"] or "",
            artifacts=[],
            error=final_state["error"],
            step_logs=final_state["step_logs"],
        )

    async def _preflight_runtime(
        self,
        *,
        execution_id: uuid.UUID,
        runtime: ResolvedAgentRuntime,
    ) -> Optional[ExecutionResult]:
        if runtime.tool_schemas and not runtime.supports_tools:
            error = ExecutionErrorModel(
                error_code=ArcErrorCode.MODEL_CAPABILITY_MISMATCH.value,
                error_source="runtime",
                error_message="Model does not support tool calling.",
            )
            return await self._fail_before_graph(
                execution_id=execution_id,
                final_answer="执行失败：模型不支持工具调用。",
                error=error,
            )

        if runtime.unavailable_requested_tools:
            missing = ", ".join(runtime.unavailable_requested_tools)
            error = ExecutionErrorModel(
                error_code=ArcErrorCode.INVALID_TOOL_CALL.value,
                error_source="runtime",
                error_message=f"Requested tools are not bound to the agent or do not exist: {missing}",
            )
            return await self._fail_before_graph(
                execution_id=execution_id,
                final_answer=f"执行失败：当前 Agent 未绑定这些工具或工具不存在：{missing}。",
                error=error,
            )

        if runtime.supports_tools and (runtime.configured_tools or runtime.requested_tool_names) and not runtime.tool_schemas:
            details: List[str] = []
            if runtime.unresolved_tools:
                details.append(f"unresolved={','.join(runtime.unresolved_tools)}")
            if runtime.binding_drift:
                details.append(f"binding_drift={json.dumps(runtime.binding_drift, ensure_ascii=False)}")
            error = ExecutionErrorModel(
                error_code=ArcErrorCode.INVALID_TOOL_CALL.value,
                error_source="runtime",
                error_message=(
                    "Agent requested tool usage but resolved runtime tool set is empty."
                    + (f" ({'; '.join(details)})" if details else "")
                ),
            )
            return await self._fail_before_graph(
                execution_id=execution_id,
                final_answer="执行失败：Agent 已声明工具，但运行时未解析到任何可执行工具。",
                error=error,
            )

        return None

    async def _fail_before_graph(
        self,
        *,
        execution_id: uuid.UUID,
        final_answer: str,
        error: ExecutionErrorModel,
    ) -> ExecutionResult:
        await self.execution_log_service.complete_execution(
            execution_id=execution_id,
            status=ExecutionStatus.FAILED.value,
            final_state=ExecutionState.TERMINATED.value,
            termination_reason=TerminationReason.FAILED.value,
            steps_used=0,
            final_answer=final_answer,
            total_token_usage=TokenUsage(),
            error=error,
            error_details=None,
        )
        return ExecutionResult(
            execution_id=execution_id,
            final_state=ExecutionState.TERMINATED,
            steps_used=0,
            termination_reason=TerminationReason.FAILED,
            execution_trace=[],
            final_answer=final_answer,
            total_token_usage=TokenUsage(),
            status=ExecutionStatus.FAILED,
            summary=final_answer,
            artifacts=[],
            error=error,
            step_logs=[],
        )

    def _build_graph(self):
        graph = StateGraph(AgentExecutionState)
        graph.add_node("prepare_context", self.prepare_context)
        graph.add_node("call_model", self.call_model)
        graph.add_node("execute_tools", self.execute_tools)
        graph.add_node("finalize_answer", self.finalize_answer)
        graph.add_node("terminate_by_limit", self.terminate_by_limit)
        graph.add_edge(START, "prepare_context")
        graph.add_edge("prepare_context", "call_model")
        graph.add_conditional_edges(
            "call_model",
            self.route_after_model,
            {
                "execute_tools": "execute_tools",
                "finalize_answer": "finalize_answer",
                "terminate_by_limit": "terminate_by_limit",
            },
        )
        graph.add_edge("execute_tools", "call_model")
        graph.add_edge("finalize_answer", END)
        graph.add_edge("terminate_by_limit", END)
        return graph.compile()

    async def prepare_context(self, state: AgentExecutionState) -> Dict[str, Any]:
        agent_cfg = state["agent_config"]
        tool_names = self._extract_tool_names(state["available_tools"])
        system_prompt = (
            f"{self.FIXED_SAFETY_PROMPT}\n"
            f"{self.FIXED_RUNTIME_PROMPT}\n"
            f"Agent Description:\n{agent_cfg.get('description', '').strip()}"
        )
        return {
            "messages": [
                Message(role="system", content=system_prompt),
                Message(role="user", content=state["user_input"]),
            ],
            "tool_names": tool_names,
            "status": ExecutionStatus.RUNNING.value,
        }

    async def call_model(self, state: AgentExecutionState) -> Dict[str, Any]:
        if state["step_count"] >= state["max_steps"]:
            return {
                "status": ExecutionStatus.TERMINATED.value,
                "termination_reason": TerminationReason.MAX_STEPS_REACHED.value,
                "final_answer": "执行终止：达到最大步数限制。",
                "last_model_finish_reason": "max_steps",
            }

        agent_cfg = state["agent_config"]
        runtime_cfg = agent_cfg.get("runtime_config") or {}
        model_config = ModelConfig(
            model=agent_cfg.get("llm_model_name", ""),
            temperature=runtime_cfg.get("temperature", 0.7),
            max_tokens=runtime_cfg.get("max_tokens"),
        )
        call_tools = [] if state["force_final_answer"] else state["available_tools"]
        forced_tool_name = (
            self._select_forced_tool(state["user_input"], state["tool_names"])
            if call_tools and state["tool_calls_used"] == 0 and not state["react_steps"]
            else None
        )
        tool_choice = (
            {
                "type": "function",
                "function": {"name": forced_tool_name},
            }
            if forced_tool_name
            else None
        )
        logger.bind(
            event="execution_debug_before_model_call",
            execution_id=str(state["execution_id"]),
            step_index=state["step_count"] + 1,
            messages_count=len(state["messages"]),
            tools_attached=bool(call_tools),
            tool_names=state["tool_names"] if call_tools else [],
            forced_tool_name=forced_tool_name,
        ).info("Calling model gateway")

        step_logs = list(state["step_logs"])
        try:
            model_resp: GatewayResponse = await self.model_gateway.call(
                messages=state["messages"],
                tools=call_tools,
                config=model_config,
                provider_url=agent_cfg.get("llm_provider_url", ""),
                api_key=decrypt_api_key(agent_cfg.get("llm_api_key_encrypted", "")),
                tool_choice=tool_choice,
            )
        except ModelGatewayException as exc:
            error_payload = (exc.data or {}).get("error", {})
            raw_error_details = error_payload.get("details")
            error_details = raw_error_details if isinstance(raw_error_details, dict) else None
            error = ExecutionErrorModel(
                error_code=str(error_payload.get("code", ArcErrorCode.NETWORK_ERROR.value)),
                error_source="gateway",
                error_message=str(error_payload.get("message", exc.message)),
            )
            self._append_step_log(
                step_logs=step_logs,
                execution_id=state["execution_id"],
                step_index=state["step_count"] + 1,
                phase="model_call",
                tool_id=None,
                status="error",
                payload={
                    "finish_reason": "error",
                    "gateway_error": {
                        "error_source": error.error_source,
                        "error_code": error.error_code,
                        "error_message": error.error_message,
                        "details": error_details,
                    },
                },
            )
            return {
                "status": ExecutionStatus.FAILED.value,
                "termination_reason": TerminationReason.FAILED.value,
                "final_answer": f"执行失败：{error.error_message}",
                "error": error,
                "error_details": error_details,
                "current_assistant_content": "",
                "current_tool_calls": [],
                "last_model_finish_reason": "error",
                "step_logs": step_logs,
            }

        usage = TokenUsage(
            prompt_tokens=state["usage"].prompt_tokens + model_resp.token_usage.prompt_tokens,
            completion_tokens=state["usage"].completion_tokens + model_resp.token_usage.completion_tokens,
            total_tokens=state["usage"].total_tokens + model_resp.token_usage.total_tokens,
            usage_estimated=state["usage"].usage_estimated or model_resp.token_usage.usage_estimated,
        )
        tool_calls = list(model_resp.tool_calls or ([] if model_resp.tool_call is None else [model_resp.tool_call]))
        logger.bind(
            event="execution_debug_after_model_call",
            execution_id=str(state["execution_id"]),
            step_index=state["step_count"] + 1,
            finish_reason=model_resp.finish_reason,
            tool_calls_present=bool(tool_calls),
            tool_call_count=len(tool_calls),
            raw_returned_function_names=[tool_call.function_name for tool_call in tool_calls],
        ).info("Model gateway returned")

        self._append_step_log(
            step_logs=step_logs,
            execution_id=state["execution_id"],
            step_index=state["step_count"] + 1,
            phase="model_call",
            tool_id=None,
            status="error" if model_resp.error else "success",
            payload={
                "content": model_resp.content,
                "tool_calls": [tool_call.model_dump() for tool_call in tool_calls],
                "finish_reason": model_resp.finish_reason,
            },
        )

        updates: Dict[str, Any] = {
            "usage": usage,
            "current_assistant_content": model_resp.content or "",
            "current_tool_calls": tool_calls,
            "current_provider_tool_name_map": (
                model_resp.provider_tool_name_to_internal_id
                if model_resp.provider_tool_name_to_internal_id
                else {tool_call.function_name: tool_call.function_name for tool_call in tool_calls}
            ),
            "current_forced_tool": forced_tool_name,
            "last_model_finish_reason": model_resp.finish_reason,
            "step_count": state["step_count"] + 1,
            "step_logs": step_logs,
            "error_details": state["error_details"],
        }

        if model_resp.finish_reason == "length":
            updates.update(
                {
                    "status": ExecutionStatus.TERMINATED.value,
                    "termination_reason": TerminationReason.MODEL_OUTPUT_TRUNCATED.value,
                    "final_answer": (model_resp.content or "").strip(),
                }
            )
            return updates

        if model_resp.finish_reason == "stop" and not tool_calls:
            if forced_tool_name:
                error = ExecutionErrorModel(
                    error_code=ArcErrorCode.INVALID_TOOL_CALL.value,
                    error_source="model_parser",
                    error_message=f"Model did not call required tool: {forced_tool_name}",
                )
                updates.update(
                    {
                        "status": ExecutionStatus.FAILED.value,
                        "termination_reason": TerminationReason.FAILED.value,
                        "final_answer": f"执行失败：模型未按要求调用工具 {forced_tool_name}。",
                        "error": error,
                    }
                )
                return updates
            return updates

        if model_resp.finish_reason == "tool_calls" and tool_calls:
            return updates

        error_message = "执行失败：模型返回了不支持的结束类型。"
        error = ExecutionErrorModel(
            error_code=ArcErrorCode.NETWORK_ERROR.value,
            error_source="gateway",
            error_message=f"Unsupported finish_reason: {model_resp.finish_reason}",
        )
        if model_resp.finish_reason == "tool_calls" and not tool_calls:
            error_message = "执行失败：模型返回了无效的工具调用。"
            error = ExecutionErrorModel(
                error_code=ArcErrorCode.INVALID_TOOL_CALL.value,
                error_source="model_parser",
                error_message="finish_reason 为 tool_calls 但未返回 tool_calls 数据。",
            )
        elif model_resp.finish_reason == "stop":
            error_message = "执行失败：模型未生成最终答案。"
            error = ExecutionErrorModel(
                error_code=ArcErrorCode.NETWORK_ERROR.value,
                error_source="gateway",
                error_message="Model stopped without content or tool calls.",
            )

        updates.update(
            {
                "status": ExecutionStatus.FAILED.value,
                "termination_reason": TerminationReason.FAILED.value,
                "final_answer": error_message,
                "error": error,
            }
        )
        return updates

    def route_after_model(self, state: AgentExecutionState) -> str:
        if state["status"] in {ExecutionStatus.FAILED.value, ExecutionStatus.TERMINATED.value}:
            return "terminate_by_limit"
        if state["current_tool_calls"]:
            return "execute_tools"
        if state["current_assistant_content"].strip():
            return "finalize_answer"
        return "terminate_by_limit"

    async def execute_tools(self, state: AgentExecutionState) -> Dict[str, Any]:
        messages = list(state["messages"])
        if state["current_tool_calls"]:
            messages.append(
                Message(
                    role="assistant",
                    content=state["current_assistant_content"] or "",
                    tool_calls=state["current_tool_calls"],
                )
            )

        react_steps = list(state["react_steps"])
        execution_trace = list(state["execution_trace"])
        step_logs = list(state["step_logs"])
        consecutive_tool_failures = state["consecutive_tool_failures"]
        tool_calls_used = state["tool_calls_used"]
        force_final_answer = state["force_final_answer"]
        previous_loop_signature = state["previous_loop_signature"]

        for tool_call in state["current_tool_calls"]:
            if tool_calls_used >= state["max_tool_calls"]:
                return {
                    "messages": messages,
                    "react_steps": react_steps,
                    "execution_trace": execution_trace,
                    "step_logs": step_logs,
                    "status": ExecutionStatus.TERMINATED.value,
                    "termination_reason": TerminationReason.FAILED.value,
                    "final_answer": "执行终止：达到最大工具调用次数限制。",
                    "current_tool_calls": [],
                }

            try:
                arguments = json.loads(tool_call.function_arguments)
            except Exception:
                error = ExecutionErrorModel(
                    error_code=ArcErrorCode.INVALID_TOOL_CALL.value,
                    error_source="model_parser",
                    error_message="function.arguments 解析失败，无法进入 tool call。",
                )
                return {
                    "messages": messages,
                    "react_steps": react_steps,
                    "execution_trace": execution_trace,
                    "step_logs": step_logs,
                    "status": ExecutionStatus.FAILED.value,
                    "termination_reason": TerminationReason.FAILED.value,
                    "final_answer": "执行失败：模型返回了非法的 function.arguments。",
                    "error": error,
                    "current_tool_calls": [],
                }

            if not isinstance(arguments, dict):
                error = ExecutionErrorModel(
                    error_code=ArcErrorCode.INVALID_TOOL_CALL.value,
                    error_source="model_parser",
                    error_message="function.arguments 必须是 JSON object。",
                )
                return {
                    "messages": messages,
                    "react_steps": react_steps,
                    "execution_trace": execution_trace,
                    "step_logs": step_logs,
                    "status": ExecutionStatus.FAILED.value,
                    "termination_reason": TerminationReason.FAILED.value,
                    "final_answer": "执行失败：模型返回的 function.arguments 不是对象。",
                    "error": error,
                    "current_tool_calls": [],
                }

            provider_tool_name = tool_call.function_name
            tool_id = state["current_provider_tool_name_map"].get(provider_tool_name)
            if not tool_id:
                error = ExecutionErrorModel(
                    error_code=ArcErrorCode.INVALID_TOOL_CALL.value,
                    error_source="model_parser",
                    error_message="Unknown provider tool name",
                )
                return {
                    "messages": messages,
                    "react_steps": react_steps,
                    "execution_trace": execution_trace,
                    "step_logs": step_logs,
                    "status": ExecutionStatus.FAILED.value,
                    "termination_reason": TerminationReason.FAILED.value,
                    "final_answer": "执行失败：模型返回了未知工具名。",
                    "error": error,
                    "error_details": {"provider_tool_name": provider_tool_name},
                    "current_tool_calls": [],
                }

            step_index = len(react_steps) + 1
            tool_calls_used += 1
            self._append_step_log(
                step_logs=step_logs,
                execution_id=state["execution_id"],
                step_index=step_index,
                phase="tool_call",
                tool_id=tool_id,
                status="success",
                payload={
                    "provider_tool_name": provider_tool_name,
                    "resolved_tool_id": tool_id,
                    "arguments": arguments,
                },
            )
            logger.bind(
                event="tool_runtime_execute",
                execution_id=str(state["execution_id"]),
                step_index=step_index,
                provider_tool_name=provider_tool_name,
                resolved_internal_tool_id=tool_id,
                tool_id=tool_id,
                arguments=arguments,
            ).info("Executing tool runtime")
            observation = await self._execute_tool(
                tool_id=tool_id,
                arguments=arguments,
                auth_context=state["auth_context"],
                request_id=state["request_id"],
                agent_id=state["agent_id"],
                execution_id=state["execution_id"],
                step_index=step_index,
                step_logs=step_logs,
            )
            consecutive_tool_failures = consecutive_tool_failures + 1 if not observation.ok else 0

            tool_payload = {
                "ok": observation.ok,
                "content": observation.content,
                "result": observation.content,
                "error": observation.error.model_dump() if observation.error else None,
            }
            messages.append(
                Message(
                    role="tool",
                    name=tool_id,
                    tool_call_id=tool_call.id,
                    content=json.dumps(tool_payload, ensure_ascii=False),
                )
            )

            error = (
                ExecutionErrorModel(
                    error_code=observation.error.code,
                    error_source="tool",
                    error_message=observation.error.message,
                )
                if observation.error
                else None
            )
            react_step = ReactStep(
                step_index=step_index,
                thought=(state["current_assistant_content"] or "").strip() or None,
                action=Action(type=ActionType.TOOL_CALL, tool_id=tool_id, arguments=arguments),
                observation=Observation(ok=observation.ok, content=observation.content, error=observation.error),
                state_before=ExecutionState.ACTING,
                state_after=ExecutionState.OBSERVING,
                error=error,
            )
            execution_trace.append(react_step)
            react_steps.append(
                {
                    "step_index": step_index,
                    "thought": react_step.thought,
                    "action": {
                        "type": ActionType.TOOL_CALL.value,
                        "tool_id": tool_id,
                        "arguments": arguments,
                    },
                    "observation": tool_payload,
                }
            )
            await self.execution_log_service.append_react_step(
                execution_id=state["execution_id"],
                request_id=state["request_id"],
                step_index=step_index,
                state_before=ExecutionState.ACTING.value,
                state_after=ExecutionState.OBSERVING.value,
                thought=react_step.thought,
                action=react_steps[-1]["action"],
                observation=tool_payload,
                step_status="failed" if error else "success",
                error_code=error.error_code if error else None,
                error_source=error.error_source if error else None,
                error_message=error.error_message if error else None,
            )

            result_hash = self._hash_content(observation.content)
            current_signature = {"tool_id": tool_id, "arguments": arguments, "hash": result_hash}
            if (
                previous_loop_signature is not None
                and previous_loop_signature["tool_id"] == current_signature["tool_id"]
                and previous_loop_signature["arguments"] == current_signature["arguments"]
                and previous_loop_signature["hash"] == current_signature["hash"]
            ):
                return {
                    "messages": messages,
                    "react_steps": react_steps,
                    "execution_trace": execution_trace,
                    "step_logs": step_logs,
                    "status": ExecutionStatus.TERMINATED.value,
                    "termination_reason": TerminationReason.FAILED.value,
                    "final_answer": "执行终止：触发 Loop Protection（相同工具、相同参数、相同结果）。",
                    "previous_loop_signature": current_signature,
                    "current_tool_calls": [],
                }
            previous_loop_signature = current_signature
            if consecutive_tool_failures >= 2:
                force_final_answer = True

        return {
            "messages": messages,
            "react_steps": react_steps,
            "execution_trace": execution_trace,
            "step_logs": step_logs,
            "tool_calls_used": tool_calls_used,
            "consecutive_tool_failures": consecutive_tool_failures,
            "force_final_answer": force_final_answer,
            "previous_loop_signature": previous_loop_signature,
            "current_tool_calls": [],
        }

    async def finalize_answer(self, state: AgentExecutionState) -> Dict[str, Any]:
        final_answer = state["current_assistant_content"].strip()
        execution_trace = list(state["execution_trace"])
        execution_trace.append(
            ReactStep(
                step_index=len(state["react_steps"]) + 1,
                thought="final_answer",
                action=Action(type=ActionType.FINISH, final_answer=final_answer),
                observation=Observation(ok=True, content={"final_answer": final_answer}, error=None),
                state_before=ExecutionState.THINKING,
                state_after=ExecutionState.FINISHED,
            )
        )
        step_logs = list(state["step_logs"])
        self._append_step_log(
            step_logs=step_logs,
            execution_id=state["execution_id"],
            step_index=len(state["react_steps"]) + 1,
            phase="final_answer",
            tool_id=None,
            status="success",
            payload={"final_answer": final_answer},
        )
        return {
            "final_answer": final_answer,
            "status": ExecutionStatus.SUCCEEDED.value,
            "termination_reason": TerminationReason.SUCCESS.value,
            "execution_trace": execution_trace,
            "step_logs": step_logs,
        }

    async def terminate_by_limit(self, state: AgentExecutionState) -> Dict[str, Any]:
        if state["status"] == ExecutionStatus.FAILED.value:
            return {}
        if state["termination_reason"] == TerminationReason.MODEL_OUTPUT_TRUNCATED.value:
            return {
                "status": ExecutionStatus.TERMINATED.value,
                "final_answer": state["final_answer"] or state["current_assistant_content"].strip(),
            }
        if state["status"] != ExecutionStatus.TERMINATED.value:
            return {
                "status": ExecutionStatus.TERMINATED.value,
                "termination_reason": TerminationReason.MAX_STEPS_REACHED.value,
                "final_answer": state["final_answer"] or "执行终止：达到最大步数限制。",
            }
        return {}

    async def _execute_tool(
        self,
        tool_id: str,
        arguments: Dict[str, Any],
        auth_context: AuthContext,
        request_id: str,
        agent_id: str,
        execution_id: uuid.UUID,
        step_index: int,
        step_logs: List[ExecutionStepLogContract],
    ) -> ToolObservation:
        try:
            result = await self.tool_runtime.execute_tool(
                tool_id=tool_id,
                arguments=arguments,
                context={
                    "user_id": auth_context.user_id,
                    "team_id": auth_context.team_id,
                    "request_id": request_id,
                    "agent_id": agent_id,
                    "execution_id": str(execution_id),
                },
            )
            parsed_content, content_type = self._normalize_tool_result(result)
            observation = ToolObservation(
                tool_id=tool_id,
                ok=True,
                content_type=content_type,
                content=parsed_content,
                error=None,
            )
            self._append_step_log(
                step_logs=step_logs,
                execution_id=execution_id,
                step_index=step_index,
                phase="observation",
                tool_id=tool_id,
                status="success",
                payload=observation.model_dump(),
            )
            return observation
        except Exception as exc:
            observation = ToolObservation(
                tool_id=tool_id,
                ok=False,
                content_type="error",
                content=None,
                error=ToolObservationError(code="TOOL_EXECUTION_ERROR", message=str(exc)),
            )
            self._append_step_log(
                step_logs=step_logs,
                execution_id=execution_id,
                step_index=step_index,
                phase="observation",
                tool_id=tool_id,
                status="error",
                payload={"error": str(exc)},
            )
            return observation

    @staticmethod
    def _normalize_tool_result(result: str) -> tuple[Any, str]:
        try:
            payload = json.loads(result)
            return payload, "json"
        except Exception:
            return result, "text"

    @staticmethod
    def _hash_content(content: Any) -> str:
        encoded = json.dumps(content, ensure_ascii=False, sort_keys=True, default=str)
        return hashlib.sha256(encoded.encode("utf-8")).hexdigest()

    @staticmethod
    def _extract_tool_names(tools: List[Dict[str, Any]]) -> List[str]:
        tool_names = [
            str(((tool.get("function") or {}).get("name", ""))).strip()
            for tool in tools
            if isinstance(tool, dict)
        ]
        return [name for name in tool_names if name]

    @staticmethod
    def _select_forced_tool(user_input: str, tool_names: List[str]) -> Optional[str]:
        normalized_input = user_input.lower()
        matches: List[str] = []
        for tool_name in tool_names:
            bare_name = tool_name.split("/", 1)[-1]
            if LangGraphExecutionStrategy._contains_explicit_tool_reference(normalized_input, tool_name.lower()) or LangGraphExecutionStrategy._contains_explicit_tool_reference(normalized_input, bare_name.lower()):
                matches.append(tool_name)
        return matches[0] if len(matches) == 1 else None

    @staticmethod
    def _contains_explicit_tool_reference(user_input: str, tool_token: str) -> bool:
        pattern = rf"(?<![a-z0-9_]){re.escape(tool_token)}(?![a-z0-9_])"
        return bool(re.search(pattern, user_input))

    @staticmethod
    def _append_step_log(
        step_logs: List[ExecutionStepLogContract],
        execution_id: uuid.UUID,
        step_index: int,
        phase: str,
        tool_id: Optional[str],
        status: str,
        payload: Dict[str, Any],
    ) -> None:
        step_logs.append(
            ExecutionStepLogContract(
                execution_id=str(execution_id),
                step_index=step_index,
                phase=phase,  # type: ignore[arg-type]
                tool_id=tool_id,
                status=status,  # type: ignore[arg-type]
                payload=payload,
                timestamp=datetime.now(timezone.utc).isoformat(),
            )
        )
