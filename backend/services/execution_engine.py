import json
import uuid
import re
from typing import List, Dict, Any, Optional, Tuple
from backend.core.logging import logger, set_request_id
from backend.models.constants import ExecutionState, TerminationReason, ActionType, ResponseCode
from backend.models.schemas import (
    Message, AgentRead, Action, Observation, ReactStep, ExecutionResult, GatewayResponse, TokenUsage, ExecutionErrorModel
)
from backend.services.model_gateway import model_gateway
from backend.core.tool_runtime import ToolExecutor, ToolRegistry
from backend.models.tool import ToolSuccessResponse
from backend.services.execution_log_service import execution_log_service

class ExecutionEngine:
    """
    AgentForge Execution Engine implementing ReAct loop.
    Strictly follows State Machine transitions and Error Isolation principles.
    
    CRITICAL ISOLATION CONSTRAINTS:
    1. NO QUOTA CHECKS: This engine must NOT query quota or DB.
    2. NO RATE LIMITING: This engine must NOT perform any rate limiting.
    3. ONLY GATEWAY RESPONSE: This engine only reacts to results returned by Model Gateway.
    """
    async def run(self, agent: AgentRead, input_data: str, team_id: str, request_id: Optional[str] = None) -> ExecutionResult:
        """
        Main execution loop for an Agent.
        """
        if not request_id:
            request_id = f"exec-{uuid.uuid4().hex[:8]}"
        
        set_request_id(request_id)
        
        execution_id = uuid.uuid4()
        max_steps = agent.constraints.get("max_steps", 5)
        
        state = ExecutionState.INIT
        steps_used = 0
        execution_trace: List[ReactStep] = []
        total_token_usage = TokenUsage()
        final_answer = None
        termination_reason = TerminationReason.ERROR_TERMINATED
        
        # 0. Initial Log Entry (Sidecar)
        try:
            await execution_log_service.start_execution(
                execution_id=execution_id,
                agent_id=agent.id,
                team_id=uuid.UUID(team_id),
                request_id=request_id,
                initial_state=state.value,
                input_data=input_data
            )
        except Exception as e:
            logger.exception(
                f"[SYSTEM][LOGGING_FAILURE] start_execution failed | execution_id={execution_id} | request_id={request_id} | error={str(e)}"
            )

        # Initial context
        tool_instruction = self._build_tool_instruction(agent.tools)
        system_prompt = agent.system_prompt + tool_instruction
        
        messages = [
            Message(role="system", content=system_prompt),
            Message(role="user", content=input_data)
        ]
        
        logger.bind(
            execution_id=str(execution_id),
            agent_id=str(agent.id),
            max_steps=max_steps
        ).info(f"Starting execution loop for agent {agent.id}")
        
        fatal_error = None
        
        try:
            while steps_used < max_steps:
                step_index = steps_used + 1
                
                step_log_id = None
                try:
                    step_log_id = await execution_log_service.start_step(
                        execution_id=execution_id,
                        step_index=step_index,
                        request_id=request_id,
                        state_before=state.value
                    )
                except Exception as e:
                    logger.exception(
                        f"[SYSTEM][LOGGING_FAILURE] start_step failed | execution_id={execution_id} | request_id={request_id} | step_index={step_index} | error={str(e)}"
                    )
                
                # D3: Context Window Truncation
                # Keep System Prompt (0) and First User Input (1)
                # Then keep the most recent 4 messages (which equals 2 full ReAct turns)
                if len(messages) > 6:
                    messages = messages[:2] + messages[-4:]
                
                step_result, step_usage = await self.step_execute(
                    messages=messages,
                    step_index=step_index,
                    agent=agent,
                    request_id=request_id,
                    current_state=state,
                    team_id=team_id
                )
                total_token_usage.prompt_tokens += step_usage.prompt_tokens
                total_token_usage.completion_tokens += step_usage.completion_tokens
                total_token_usage.total_tokens += step_usage.total_tokens
                state = step_result.state_after
                execution_trace.append(step_result)
                steps_used += 1
                
                try:
                    await execution_log_service.complete_step(
                        step_log_id=step_log_id,
                        step=step_result,
                        execution_id=execution_id,
                    )
                except Exception as e:
                    logger.exception(
                        f"[SYSTEM][LOGGING_FAILURE] complete_step failed | execution_id={execution_id} | request_id={request_id} | step_index={step_index} | step_log_id={step_log_id} | error={str(e)}"
                    )
                
                messages.append(Message(role="assistant", content=step_result.thought))
                obs = step_result.observation
                if obs.error:
                    obs_content = f"Observation Error: {obs.error}"
                else:
                    obs_content = f"Observation: {json.dumps(obs.result)}"
                
                # D3: Observation Length Truncation
                # Hard limit observation to 2000 characters to prevent Token bloat
                if len(obs_content) > 2000:
                    obs_content = obs_content[:2000] + "\n...[Output Truncated]..."
                
                messages.append(Message(role="user", content=obs_content))
                
                if state == ExecutionState.FINISHED:
                    termination_reason = TerminationReason.SUCCESS
                    final_answer = step_result.action.final_answer
                    break
                elif state == ExecutionState.TERMINATED:
                    termination_reason = TerminationReason.ERROR_TERMINATED
                    break
            else:
                # Loop completed without break
                if state not in [ExecutionState.FINISHED, ExecutionState.TERMINATED]:
                    state = ExecutionState.TERMINATED
                    termination_reason = TerminationReason.MAX_STEPS_REACHED
                    fatal_error = ExecutionErrorModel(
                        error_code=ResponseCode.ENGINE_ERROR,
                        error_source="engine",
                        error_message="Max steps reached without finishing."
                    )

        except Exception as e:
            logger.exception(f"Critical failure in execution engine loop: {str(e)}")
            state = ExecutionState.TERMINATED
            termination_reason = TerminationReason.ERROR_TERMINATED
            fatal_error = ExecutionErrorModel(
                error_code=ResponseCode.ENGINE_ERROR,
                error_source="engine",
                error_message=str(e)
            )

        # 7. Finalize Log Entry (Sidecar)
        try:
            status = "success" if termination_reason == TerminationReason.SUCCESS else "failed"
            last_error = fatal_error
            if status == "failed" and last_error is None:
                if execution_trace and execution_trace[-1].error is not None:
                    last_error = execution_trace[-1].error
                    
            await execution_log_service.complete_execution(
                execution_id=execution_id,
                status=status,
                final_state=state.value,
                termination_reason=termination_reason.value,
                steps_used=steps_used,
                final_answer=final_answer,
                total_token_usage=total_token_usage,
                error=last_error
            )
        except Exception as e:
            logger.exception(
                f"[SYSTEM][LOGGING_FAILURE] complete_execution failed | execution_id={execution_id} | request_id={request_id} | error={str(e)}"
            )

        logger.info(f"Execution {execution_id} finished with state {state} in {steps_used} steps.")
        
        return ExecutionResult(
            execution_id=execution_id,
            final_state=state,
            steps_used=steps_used,
            termination_reason=termination_reason,
            execution_trace=execution_trace,
            final_answer=final_answer,
            total_token_usage=total_token_usage
        )

    async def step_execute(
        self, 
        messages: List[Message], 
        step_index: int, 
        agent: AgentRead, 
        request_id: str,
        current_state: ExecutionState,
        team_id: str
    ) -> Tuple[ReactStep, TokenUsage]:
        """
        Executes a single ReAct step.
        Returns the ReactStep result and the TokenUsage for this step.
        """
        state_before = current_state
        state_after = current_state
        
        thought = "Attempting to generate next step..."
        action = Action(type=ActionType.FINISH, final_answer="Internal Error")
        observation = Observation()
        step_usage = TokenUsage()
        step_error = None
        
        # --- THINKING PHASE ---
        state_after = ExecutionState.THINKING
        try:
            gateway_resp: GatewayResponse = await model_gateway.chat(
                messages=messages,
                config=agent.llm_config,
                team_id=team_id
            )
            
            step_usage = gateway_resp.token_usage
            
            if gateway_resp.error:
                thought = f"Failed to think: {gateway_resp.error.message}"
                observation.error = f"Model Gateway Error: {gateway_resp.error.message}"
                state_after = ExecutionState.TERMINATED
                step_error = ExecutionErrorModel(
                    error_code=gateway_resp.error.code.value if hasattr(gateway_resp.error.code, "value") else str(gateway_resp.error.code),
                    error_source="gateway",
                    error_message=gateway_resp.error.message
                )
                return self._create_step_tuple(step_index, thought, action, observation, state_before, state_after, step_usage, step_error)

            llm_content = gateway_resp.content
            thought, action = self._parse_llm_output(llm_content)
            
            # EXPLICIT ERROR HANDLING: Engine terminates if action is ERROR
            if action.type == ActionType.ERROR:
                step_error = ExecutionErrorModel(
                    error_code=ResponseCode.ENGINE_ERROR,
                    error_source="parser",
                    error_message=action.final_answer or "Unknown parsing error."
                )
                state_after = ExecutionState.TERMINATED
                observation.error = step_error.error_message
                return self._create_step_tuple(step_index, thought, action, observation, state_before, state_after, step_usage, step_error)
            
        except Exception as e:
            logger.error(f"Thinking phase failed: {str(e)}")
            observation.error = f"Engine error during Thinking: {str(e)}"
            state_after = ExecutionState.TERMINATED
            step_error = ExecutionErrorModel(
                error_code=ResponseCode.ENGINE_ERROR,
                error_source="engine",
                error_message=str(e)
            )
            return self._create_step_tuple(step_index, thought, action, observation, state_before, state_after, step_usage, step_error)

        # --- ACTING PHASE ---
        if action.type == ActionType.FINISH:
            state_after = ExecutionState.FINISHED
            observation.result = "Finished."
            return self._create_step_tuple(step_index, thought, action, observation, state_before, state_after, step_usage, step_error)
        
        state_after = ExecutionState.ACTING
        try:
            # --- OBSERVING PHASE ---
            tool_resp = ToolExecutor.execute(
                name=action.tool_name or "unknown",
                input_data=action.input_data or {},
                request_id=request_id
            )
            
            observation.tool_name = action.tool_name
            if isinstance(tool_resp, ToolSuccessResponse):
                observation.result = tool_resp.data
                state_after = ExecutionState.OBSERVING
            else:
                observation.error = tool_resp.error.message
                state_after = ExecutionState.OBSERVING # Error in tool still allows next cycle
                step_error = ExecutionErrorModel(
                    error_code=tool_resp.error.code.value if hasattr(tool_resp.error.code, "value") else str(tool_resp.error.code),
                    error_source="tool",
                    error_message=tool_resp.error.message
                )

        except Exception as e:
            logger.error(f"Acting/Observing phase failed: {str(e)}")
            observation.error = f"Engine error during Action: {str(e)}"
            state_after = ExecutionState.OBSERVING
            step_error = ExecutionErrorModel(
                error_code=ResponseCode.ENGINE_ERROR,
                error_source="engine",
                error_message=str(e)
            )

        return self._create_step_tuple(step_index, thought, action, observation, state_before, state_after, step_usage, step_error)

    def _create_step_tuple(self, index, thought, action, obs, s_before, s_after, usage, error=None) -> Tuple[ReactStep, TokenUsage]:
        step = ReactStep(
            step_index=index,
            thought=thought,
            action=action,
            observation=obs,
            state_before=s_before,
            state_after=s_after,
            error=error
        )
        return step, usage
    
    def _build_tool_instruction(self, tool_names: List[str]) -> str:
        """
        Dynamically build the tool instruction prompt based on the agent's configured tools.
        """
        if not tool_names:
            return ""
        
        registry = ToolRegistry()
        tools_info = []
        for name in tool_names:
            tool = registry.get_tool(name)
            if tool:
                tools_info.append({
                    "name": tool.definition.name,
                    "description": tool.definition.description,
                    "input_schema": tool.definition.input_schema
                })
        
        if not tools_info:
            return ""

        instruction = "\n\n# Available Tools\n"
        instruction += "You have access to the following tools to help you complete your task:\n"
        for t in tools_info:
            instruction += f"- {t['name']}: {t['description']}\n"
            instruction += f"  Input Schema: {json.dumps(t['input_schema'])}\n"
        
        instruction += "\n# Output Format\n"
        instruction += "You MUST respond using the following JSON format in a code block for every step.\n"
        instruction += "To call a tool:\n"
        instruction += "```json\n"
        instruction += '{\n  "thought": "Your reasoning for calling the tool",\n  "action": {\n    "type": "tool_call",\n    "tool_name": "tool_name_here",\n    "input_data": {"key": "value"}\n  }\n}\n'
        instruction += "```\n"
        instruction += "To provide the final answer:\n"
        instruction += "```json\n"
        instruction += '{\n  "thought": "Your reasoning for finishing",\n  "action": {\n    "type": "finish",\n    "final_answer": "Your final answer here"\n  }\n}\n'
        instruction += "```\n"
        instruction += "IMPORTANT CONSTRAINTS:\n"
        instruction += "1. You MUST ONLY output the JSON block, and NOTHING else.\n"
        instruction += "2. You MUST NOT use natural language to substitute tool execution.\n"
        instruction += "3. If the task requires Python code execution, ALWAYS use 'python_executor'.\n"
        
        return instruction

    def _parse_llm_output(self, content: str) -> Tuple[str, Action]:
        """
        Robust parsing of LLM output into Thought and Action.
        Ensures strict adherence to the defined Action schemas.
        """
        # 1. Extract JSON block
        json_str = ""
        json_match = re.search(r'```json\s*(.*?)\s*```', content, re.DOTALL)
        if json_match:
            json_str = json_match.group(1).strip()
        else:
            # Fallback: try to find anything that looks like a JSON object
            json_match = re.search(r'\{.*\}', content, re.DOTALL)
            if json_match:
                json_str = json_match.group(0).strip()
        
        # 2. Extract Thought (everything before JSON or the whole content)
        thought = content
        if json_match:
            thought = content[:json_match.start()].strip()
        
        if not thought:
            thought = "Thinking..."

        # 3. Parse Action
        if not json_str:
            # ERROR: If no JSON found, return explicit error instead of implicit finish
            return thought, Action(type=ActionType.ERROR, final_answer="Failed to parse LLM output: No valid JSON block found.")

        try:
            data = json.loads(json_str)
            
            # If JSON has a "thought" field, use it
            if isinstance(data, dict) and "thought" in data:
                thought = data["thought"]

            # Standard ReAct format: {"action": {"type": "...", ...}}
            action_data = data.get("action") if isinstance(data, dict) else None
            
            # Fallback: the whole JSON might be the action
            if not action_data and isinstance(data, dict):
                action_data = data

            if not action_data or not isinstance(action_data, dict):
                # ERROR: JSON exists but not a valid action dict
                return thought, Action(type=ActionType.ERROR, final_answer="Failed to parse LLM output: 'action' field is missing or invalid.")

            a_type = action_data.get("type")
            
            if a_type == "finish":
                return thought, Action(
                    type=ActionType.FINISH, 
                    final_answer=action_data.get("final_answer", content.strip())
                )
            elif a_type == "tool_call":
                tool_name = action_data.get("tool_name")
                if not tool_name:
                    # ERROR: Missing tool name
                    return thought, Action(type=ActionType.ERROR, final_answer="Failed to parse LLM output: 'tool_name' is missing in tool_call action.")
                
                return thought, Action(
                    type=ActionType.TOOL_CALL,
                    tool_name=tool_name,
                    input_data=action_data.get("input_data", {})
                )
            else:
                # ERROR: Unknown action type
                return thought, Action(type=ActionType.ERROR, final_answer=f"Failed to parse LLM output: Unknown action type '{a_type}'.")

        except Exception as e:
            # ERROR: Any JSON parsing error
            return thought, Action(type=ActionType.ERROR, final_answer=f"Failed to parse LLM output: JSON decode error - {str(e)}.")

# Singleton instance
execution_engine = ExecutionEngine()
