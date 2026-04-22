from typing import Any, Dict, Generic, List, Literal, Optional, TypeVar, Union
from pydantic import BaseModel, Field, UUID4, field_validator
from backend.models.constants import (
    ArcErrorCode,
    ResponseCode,
    ExecutionState,
    TerminationReason,
    ActionType,
    QuotaStatus,
    ExecutionStatus,
)

T = TypeVar("T")

class BaseResponse(BaseModel, Generic[T]):
    code: ResponseCode
    message: str
    data: Optional[T] = None

    @classmethod
    def success(cls, data: Any = None, message: str = "success"):
        return cls(code=ResponseCode.SUCCESS, message=message, data=data)

    @classmethod
    def error(cls, code: ResponseCode, message: str, data: Any = None):
        return cls(code=code, message=message, data=data)

class AuthContext(BaseModel):
    user_id: str
    team_id: str
    auth_mode: str
    request_id: str
    role: str = "member"
    is_dev: bool = False

class TokenUsage(BaseModel):
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    usage_estimated: bool = False

class Message(BaseModel):
    role: Literal["system", "user", "assistant", "tool"]
    content: Optional[str] = None
    name: Optional[str] = None
    tool_call_id: Optional[str] = None

class GatewayError(BaseModel):
    code: Union[ArcErrorCode, str]
    message: str

class GatewayResponse(BaseModel):
    content: str
    token_usage: TokenUsage
    finish_reason: Optional[str] = None
    error: Optional[GatewayError] = None
    tool_call: Optional["GatewayToolCall"] = None


class GatewayToolCall(BaseModel):
    id: str
    function_name: str
    function_arguments: str

class Action(BaseModel):
    type: ActionType
    tool_id: Optional[str] = None
    arguments: Optional[Dict[str, Any]] = None
    final_answer: Optional[str] = None

class ToolObservationError(BaseModel):
    code: str
    message: str


class ToolObservation(BaseModel):
    type: Literal["tool_observation"] = "tool_observation"
    tool_id: str
    ok: bool
    content_type: Literal["text", "json", "error"]
    content: Optional[Union[str, Dict[str, Any], List[Any]]] = None
    error: Optional[ToolObservationError] = None


class Observation(BaseModel):
    ok: bool = True
    content: Optional[Any] = None
    error: Optional[ToolObservationError] = None

class ExecutionErrorModel(BaseModel):
    error_code: str
    error_source: str
    error_message: str

    @field_validator("error_code", mode="before")
    @classmethod
    def convert_error_code_to_str(cls, v: Any) -> str:
        return str(v)

class ReactStep(BaseModel):
    step_index: int
    thought: Optional[str] = None
    action: Optional[Action] = None
    observation: Optional[Observation] = None
    state_before: ExecutionState
    state_after: ExecutionState
    error: Optional[ExecutionErrorModel] = None

class ExecutionResult(BaseModel):
    execution_id: UUID4
    final_state: ExecutionState
    steps_used: int
    termination_reason: TerminationReason
    execution_trace: List[ReactStep]
    final_answer: Optional[str] = None
    total_token_usage: TokenUsage = Field(default_factory=TokenUsage)
    status: ExecutionStatus = ExecutionStatus.PENDING
    summary: str = ""
    artifacts: List[Dict[str, Any]] = Field(default_factory=list)
    error: Optional[ExecutionErrorModel] = None
    step_logs: List["ExecutionStepLogContract"] = Field(default_factory=list)


class ExecutionStepLogContract(BaseModel):
    execution_id: str
    step_index: int
    phase: Literal["model_call", "tool_call", "observation", "final_answer"]
    tool_id: Optional[str] = None
    status: Literal["success", "error"]
    payload: Dict[str, Any]
    timestamp: str


class FinalAnswerContract(BaseModel):
    execution_id: str
    status: Literal["SUCCEEDED", "FAILED", "TERMINATED"]
    final_answer: str
    summary: str
    artifacts: List[Dict[str, Any]]
    error: Optional[Dict[str, Any]]

class ModelConfig(BaseModel):
    model: str
    temperature: float = 0.7
    max_tokens: Optional[int] = None

class AgentCapabilityFlags(BaseModel):
    supports_tools: bool = True


class AgentRuntimeConfig(BaseModel):
    temperature: float = 0.7
    max_tokens: Optional[int] = None


class AgentCreateRequest(BaseModel):
    name: str
    description: str
    avatar_url: Optional[str] = None
    llm_provider_url: str
    llm_api_key: str
    llm_model_name: str
    runtime_config: AgentRuntimeConfig = Field(default_factory=AgentRuntimeConfig)
    capability_flags: AgentCapabilityFlags = Field(default_factory=AgentCapabilityFlags)
    tools: List[str] = Field(default_factory=list)
    constraints: Dict[str, Any] = Field(default_factory=lambda: {"max_steps": 6})

    @field_validator("name", "description", "llm_provider_url", "llm_api_key", "llm_model_name")
    @classmethod
    def validate_required_non_empty(cls, v: str) -> str:
        value = v.strip()
        if not value:
            raise ValueError("field cannot be empty")
        return value


class AgentUpdateRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    avatar_url: Optional[str] = None
    llm_provider_url: Optional[str] = None
    llm_api_key: Optional[str] = None
    llm_model_name: Optional[str] = None
    runtime_config: Optional[AgentRuntimeConfig] = None
    capability_flags: Optional[AgentCapabilityFlags] = None
    tools: Optional[List[str]] = None
    constraints: Optional[Dict[str, Any]] = None

    @field_validator("name", "description", "llm_provider_url", "llm_api_key", "llm_model_name")
    @classmethod
    def validate_optional_non_empty(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        value = v.strip()
        if not value:
            raise ValueError("field cannot be empty")
        return value


class AgentRead(BaseModel):
    id: UUID4
    name: str
    description: str
    avatar_url: Optional[str] = None
    llm_provider_url: str
    llm_model_name: str
    runtime_config: AgentRuntimeConfig
    capability_flags: AgentCapabilityFlags
    tools: List[str]
    constraints: Dict[str, Any]
    has_api_key: bool

class AgentCreateResponse(BaseModel):
    id: UUID4

class ExecuteAgentRequest(BaseModel):
    input: str

class ExecuteAgentResponse(BaseModel):
    execution_id: UUID4
    final_state: ExecutionState
    termination_reason: TerminationReason
    steps_used: int
    request_id: str

class TeamQuotaStatusData(BaseModel):
    team_id: str
    token_limit: int
    token_used: int
    rate_limit: int
    current_usage_state: str
    quota_status: QuotaStatus

class SandboxRequest(BaseModel):
    code: str
    input_data: Dict[str, Any] = Field(default_factory=dict)

class SandboxResponse(BaseModel):
    observation: Dict[str, Any]
