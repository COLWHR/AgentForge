import hashlib
import json
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from backend.core.database import AsyncSessionLocal
from backend.core.exceptions import ModelGatewayException
from backend.core.logging import logger, set_auth_mode, set_request_id, set_team_id, set_user_id
from backend.core.security import decrypt_api_key
from backend.models.constants import ActionType, ArcErrorCode, ExecutionState, ExecutionStatus, ResponseCode, TerminationReason
from backend.models.schemas import (
    Action,
    AuthContext,
    ExecutionErrorModel,
    ExecutionResult,
    ExecutionStepLogContract,
    FinalAnswerContract,
    Message,
    ModelConfig,
    Observation,
    ReactStep,
    TokenUsage,
    ToolObservation,
    ToolObservationError,
)
from backend.services.agent_service import agent_service
from backend.services.execution_log_service import execution_log_service
from backend.services.marketplace_tool_adapter import marketplace_tool_adapter
from backend.services.model_gateway import model_gateway


class ExecutionEngine:
    MAX_STEPS = 6
    MAX_TOOL_CALLS = 4
    TIMEOUT_SECONDS = 30
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
    )

    async def run(
        self,
        agent_id: str,
        user_input: str,
        auth_context: AuthContext,
        request_id: Optional[str] = None,
    ) -> ExecutionResult:
        if not request_id:
            request_id = auth_context.request_id or f"exec-{uuid.uuid4().hex[:8]}"

        set_request_id(request_id)
        set_team_id(auth_context.team_id)
        set_user_id(auth_context.user_id)
        set_auth_mode(auth_context.auth_mode)

        execution_id = uuid.uuid4()
        status = ExecutionStatus.PENDING
        final_state = ExecutionState.INIT
        termination_reason = TerminationReason.FAILED
        total_token_usage = TokenUsage()
        execution_trace: List[ReactStep] = []
        step_logs: List[ExecutionStepLogContract] = []
        artifacts: List[Dict[str, Any]] = []
        final_answer_text = ""
        last_error: Optional[ExecutionErrorModel] = None
        tool_calls_used = 0
        consecutive_tool_failures = 0
        force_final_answer = False
        previous_loop_signature: Optional[Dict[str, Any]] = None
        steps_used = 0

        async with AsyncSessionLocal() as db:
            agent = await agent_service.get_agent_raw(db, uuid.UUID(agent_id))
        if agent is None:
            raise ValueError(f"Agent not found: {agent_id}")
        agent_cfg = agent.config or {}
        if not agent_cfg.get("llm_model_name"):
            raise ValueError("Agent model config is incomplete")

        status = ExecutionStatus.RUNNING
        await execution_log_service.start_execution(
            execution_id=execution_id,
            agent_id=agent.id,
            team_id=uuid.UUID(auth_context.team_id),
            request_id=request_id,
            initial_state=final_state.value,
            input_data=user_input,
        )

        tools_schema = await marketplace_tool_adapter.get_tools_schema(agent.id)
        supports_tools = bool(agent_cfg.get("capability_flags", {}).get("supports_tools", False))
        configured_tools = agent_cfg.get("tools") or []
        available_tools_count = len(tools_schema or configured_tools)
        logger.bind(
            event="execution_debug_start",
            agent_id=str(agent.id),
            supports_tools=supports_tools,
            tools_count=available_tools_count,
            model_name=agent_cfg.get("llm_model_name", ""),
        ).info("Execution started")
        if (tools_schema or configured_tools) and not supports_tools:
            status = ExecutionStatus.FAILED
            final_state = ExecutionState.TERMINATED
            termination_reason = TerminationReason.FAILED
            last_error = ExecutionErrorModel(
                error_code=ArcErrorCode.MODEL_CAPABILITY_MISMATCH.value,
                error_source="gateway",
                error_message="Model does not support tool calling.",
            )
            final_answer_text = "执行失败：模型不支持工具调用。"
            await execution_log_service.complete_execution(
                execution_id=execution_id,
                status=status.value,
                final_state=final_state.value,
                termination_reason=termination_reason.value,
                steps_used=0,
                final_answer=final_answer_text,
                total_token_usage=total_token_usage,
                error=last_error,
            )
            return ExecutionResult(
                execution_id=execution_id,
                final_state=final_state,
                steps_used=0,
                termination_reason=termination_reason,
                execution_trace=[],
                final_answer=final_answer_text,
                total_token_usage=total_token_usage,
                status=status,
                summary=final_answer_text,
                artifacts=[],
                error=last_error,
                step_logs=[],
            )

        decrypted_api_key = decrypt_api_key(agent_cfg.get("llm_api_key_encrypted", ""))
        system_prompt = (
            f"{self.FIXED_SAFETY_PROMPT}\n"
            f"{self.FIXED_RUNTIME_PROMPT}\n"
            f"Agent Description:\n{agent_cfg.get('description', '').strip()}"
        )
        messages: List[Message] = [
            Message(role="system", content=system_prompt),
            Message(role="user", content=user_input),
        ]

        for step_index in range(1, self.MAX_STEPS + 1):
            steps_used = step_index
            call_tools = [] if force_final_answer else tools_schema
            tool_names = [
                str(((tool.get("function") or {}).get("name", ""))).strip()
                for tool in call_tools
                if isinstance(tool, dict)
            ]
            tool_names = [name for name in tool_names if name]
            runtime_cfg = agent_cfg.get("runtime_config") or {}
            model_config = ModelConfig(
                model=agent_cfg.get("llm_model_name", ""),
                temperature=runtime_cfg.get("temperature", 0.7),
                max_tokens=runtime_cfg.get("max_tokens"),
            )
            logger.bind(
                event="execution_debug_before_model_call",
                step_index=step_index,
                messages_count=len(messages),
                tools_attached=bool(call_tools),
                tool_names=tool_names,
            ).info("Calling model gateway")
            try:
                model_resp = await model_gateway.call(
                    messages=messages,
                    tools=call_tools,
                    config=model_config,
                    provider_url=agent_cfg.get("llm_provider_url", ""),
                    api_key=decrypted_api_key,
                )
            except ModelGatewayException as exc:
                error_payload = (exc.data or {}).get("error", {})
                status = ExecutionStatus.FAILED
                final_state = ExecutionState.TERMINATED
                termination_reason = TerminationReason.FAILED
                last_error = ExecutionErrorModel(
                    error_code=str(error_payload.get("code", ArcErrorCode.NETWORK_ERROR.value)),
                    error_source="gateway",
                    error_message=str(error_payload.get("message", exc.message)),
                )
                final_answer_text = f"执行失败：{last_error.error_message}"
                break
            total_token_usage.prompt_tokens += model_resp.token_usage.prompt_tokens
            total_token_usage.completion_tokens += model_resp.token_usage.completion_tokens
            total_token_usage.total_tokens += model_resp.token_usage.total_tokens
            logger.bind(
                event="execution_debug_after_model_call",
                step_index=step_index,
                finish_reason=model_resp.finish_reason,
                tool_calls_present=bool(model_resp.tool_call),
                tool_call_count=1 if model_resp.tool_call else 0,
            ).info("Model gateway returned")

            self._append_step_log(
                step_logs=step_logs,
                execution_id=execution_id,
                step_index=step_index,
                phase="model_call",
                tool_id=None,
                status="error" if model_resp.error else "success",
                payload={
                    "content": model_resp.content,
                    "tool_call": model_resp.tool_call.model_dump() if model_resp.tool_call else None,
                    "finish_reason": model_resp.finish_reason,
                },
            )

            if model_resp.finish_reason == "length":
                status = ExecutionStatus.TERMINATED
                final_state = ExecutionState.TERMINATED
                termination_reason = TerminationReason.MODEL_OUTPUT_TRUNCATED
                final_answer_text = model_resp.content.strip()
                break

            if model_resp.finish_reason == "stop" and not model_resp.tool_call:
                status = ExecutionStatus.SUCCEEDED
                final_state = ExecutionState.FINISHED
                termination_reason = TerminationReason.SUCCESS
                final_answer_text = model_resp.content.strip()
                self._append_step_log(
                    step_logs=step_logs,
                    execution_id=execution_id,
                    step_index=step_index,
                    phase="final_answer",
                    tool_id=None,
                    status="success",
                    payload={"final_answer": final_answer_text},
                )
                execution_trace.append(
                    ReactStep(
                        step_index=step_index,
                        thought="final_answer",
                        action=Action(type=ActionType.FINISH, final_answer=final_answer_text),
                        observation=Observation(ok=True, content={"final_answer": final_answer_text}, error=None),
                        state_before=ExecutionState.THINKING,
                        state_after=ExecutionState.FINISHED,
                    )
                )
                break

            if model_resp.finish_reason != "tool_calls":
                status = ExecutionStatus.FAILED
                final_state = ExecutionState.TERMINATED
                termination_reason = TerminationReason.FAILED
                last_error = ExecutionErrorModel(
                    error_code=ArcErrorCode.NETWORK_ERROR.value,
                    error_source="gateway",
                    error_message=f"Unsupported finish_reason: {model_resp.finish_reason}",
                )
                final_answer_text = "执行失败：模型返回了不支持的结束类型。"
                break

            if not model_resp.tool_call:
                status = ExecutionStatus.FAILED
                final_state = ExecutionState.TERMINATED
                termination_reason = TerminationReason.FAILED
                last_error = ExecutionErrorModel(
                    error_code=ArcErrorCode.INVALID_TOOL_CALL.value,
                    error_source="model_parser",
                    error_message="finish_reason 为 tool_calls 但未返回 tool_calls 数据。",
                )
                final_answer_text = "执行失败：模型返回了无效的工具调用。"
                break

            if tool_calls_used >= self.MAX_TOOL_CALLS:
                status = ExecutionStatus.TERMINATED
                final_state = ExecutionState.TERMINATED
                termination_reason = TerminationReason.FAILED
                final_answer_text = "执行终止：达到最大工具调用次数限制。"
                break

            tool_id = model_resp.tool_call.function_name
            tool_call_id = model_resp.tool_call.id
            try:
                arguments = json.loads(model_resp.tool_call.function_arguments)
            except Exception:
                status = ExecutionStatus.FAILED
                final_state = ExecutionState.TERMINATED
                termination_reason = TerminationReason.FAILED
                last_error = ExecutionErrorModel(
                    error_code=ArcErrorCode.INVALID_TOOL_CALL.value,
                    error_source="model_parser",
                    error_message="function.arguments 解析失败，无法进入 tool call。",
                )
                final_answer_text = "执行失败：模型返回了非法的 function.arguments。"
                break

            if not isinstance(arguments, dict):
                status = ExecutionStatus.FAILED
                final_state = ExecutionState.TERMINATED
                termination_reason = TerminationReason.FAILED
                last_error = ExecutionErrorModel(
                    error_code=ArcErrorCode.INVALID_TOOL_CALL.value,
                    error_source="model_parser",
                    error_message="function.arguments 必须是 JSON object。",
                )
                final_answer_text = "执行失败：模型返回的 function.arguments 不是对象。"
                break

            self._append_step_log(
                step_logs=step_logs,
                execution_id=execution_id,
                step_index=step_index,
                phase="tool_call",
                tool_id=tool_id,
                status="success",
                payload={"tool_id": tool_id, "arguments": arguments},
            )

            tool_calls_used += 1
            messages.append(Message(role="assistant", content=model_resp.content or ""))
            observation = await self._execute_tool_with_retry(
                tool_id=tool_id,
                arguments=arguments,
                auth_context=auth_context,
                request_id=request_id,
                agent_id=str(agent.id),
                execution_id=execution_id,
                step_index=step_index,
                step_logs=step_logs,
            )
            consecutive_tool_failures = consecutive_tool_failures + 1 if not observation.ok else 0

            tool_message = Message(
                role="tool",
                name=tool_id,
                tool_call_id=tool_call_id,
                content=json.dumps(
                    {
                        "ok": observation.ok,
                        "content": observation.content,
                        "error": observation.error.model_dump() if observation.error else None,
                    },
                    ensure_ascii=False,
                ),
            )
            messages.append(tool_message)
            execution_trace.append(
                ReactStep(
                    step_index=step_index,
                    thought=f"tool_call:{tool_id}",
                    action=Action(type=ActionType.TOOL_CALL, tool_id=tool_id, arguments=arguments),
                    observation=Observation(
                        ok=observation.ok,
                        content=observation.content,
                        error=observation.error,
                    ),
                    state_before=ExecutionState.ACTING,
                    state_after=ExecutionState.OBSERVING,
                    error=ExecutionErrorModel(
                        error_code=observation.error.code,
                        error_source="tool",
                        error_message=observation.error.message,
                    )
                    if observation.error
                    else None,
                )
            )

            result_hash = self._hash_content(observation.content)
            current_signature = {"tool_id": tool_id, "arguments": arguments, "hash": result_hash}
            if (
                previous_loop_signature is not None
                and previous_loop_signature["tool_id"] == current_signature["tool_id"]
                and previous_loop_signature["arguments"] == current_signature["arguments"]
                and previous_loop_signature["hash"] == current_signature["hash"]
            ):
                status = ExecutionStatus.TERMINATED
                final_state = ExecutionState.TERMINATED
                termination_reason = TerminationReason.FAILED
                final_answer_text = "执行终止：触发 Loop Protection（相同工具、相同参数、相同结果）。"
                break
            previous_loop_signature = current_signature

            if consecutive_tool_failures >= 2:
                force_final_answer = True

        if status == ExecutionStatus.RUNNING:
            status = ExecutionStatus.TERMINATED
            final_state = ExecutionState.TERMINATED
            termination_reason = TerminationReason.MAX_STEPS_REACHED
            final_answer_text = "执行终止：达到最大步数限制。"

        final_contract = FinalAnswerContract(
            execution_id=str(execution_id),
            status=status.value,
            final_answer=final_answer_text,
            summary=final_answer_text,
            artifacts=artifacts,
            error=last_error.model_dump() if last_error else None,
        )

        await execution_log_service.complete_execution(
            execution_id=execution_id,
            status=status.value,
            final_state=final_state.value,
            termination_reason=termination_reason.value,
            steps_used=steps_used,
            final_answer=final_answer_text,
            total_token_usage=total_token_usage,
            error=last_error,
        )

        return ExecutionResult(
            execution_id=execution_id,
            final_state=final_state,
            steps_used=steps_used,
            termination_reason=termination_reason,
            execution_trace=execution_trace,
            final_answer=final_contract.final_answer,
            total_token_usage=total_token_usage,
            status=status,
            summary=final_contract.summary,
            artifacts=final_contract.artifacts,
            error=last_error,
            step_logs=step_logs,
        )

    async def _execute_tool_with_retry(
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
        error_observation = ToolObservation(
            tool_id=tool_id,
            ok=False,
            content_type="error",
            content=None,
            error=ToolObservationError(code="TOOL_EXECUTION_ERROR", message="工具执行失败"),
        )
        logger.bind(
            event="execution_debug_tool_runtime_start",
            tool_id=tool_id,
            arguments=arguments,
        ).info("Executing tool runtime")

        for attempt in range(2):
            try:
                result = await marketplace_tool_adapter.execute_tool(
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
                logger.bind(
                    event="execution_debug_tool_runtime_end",
                    tool_id=tool_id,
                    arguments=arguments,
                    observation_summary=self._summarize_observation(observation.content),
                ).info("Tool runtime completed")
                return observation
            except Exception as exc:
                error_observation = ToolObservation(
                    tool_id=tool_id,
                    ok=False,
                    content_type="error",
                    content=None,
                    error=ToolObservationError(
                        code="TOOL_EXECUTION_ERROR",
                        message=str(exc),
                    ),
                )
                self._append_step_log(
                    step_logs=step_logs,
                    execution_id=execution_id,
                    step_index=step_index,
                    phase="observation",
                    tool_id=tool_id,
                    status="error",
                    payload={"attempt": attempt + 1, "error": str(exc)},
                )
                logger.bind(
                    event="execution_debug_tool_runtime_end",
                    tool_id=tool_id,
                    arguments=arguments,
                    observation_summary=f"error:{str(exc)[:200]}",
                ).warning("Tool runtime failed")

        return error_observation

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
    def _summarize_observation(content: Any) -> str:
        if content is None:
            return "none"
        if isinstance(content, str):
            trimmed = content.strip().replace("\n", " ")
            return f"text:{trimmed[:200]}"
        if isinstance(content, dict):
            keys = list(content.keys())[:8]
            return f"json_object_keys:{keys}"
        if isinstance(content, list):
            return f"json_array_len:{len(content)}"
        rendered = str(content).replace("\n", " ")
        return f"value:{rendered[:200]}"

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

# Singleton instance
execution_engine = ExecutionEngine()
