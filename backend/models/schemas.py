from typing import Any, Generic, Optional, TypeVar, List, Dict
from pydantic import BaseModel, Field, UUID4, ConfigDict, field_validator
from backend.models.constants import ResponseCode, ExecutionState, TerminationReason, ActionType, QuotaStatus

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

class TokenUsage(BaseModel):
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0

class Message(BaseModel):
    role: str
    content: str

class GatewayError(BaseModel):
    code: ResponseCode
    message: str

class GatewayResponse(BaseModel):
    content: str
    token_usage: TokenUsage
    error: Optional[GatewayError] = None

class Action(BaseModel):
    type: ActionType
    tool_name: Optional[str] = None
    input_data: Optional[Dict[str, Any]] = None
    final_answer: Optional[str] = None

class Observation(BaseModel):
    tool_name: Optional[str] = None
    result: Optional[Any] = None
    error: Optional[str] = None

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
    thought: str
    action: Action
    observation: Observation
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

class ModelConfig(BaseModel):
    model: str
    temperature: float = 0.7
    max_tokens: Optional[int] = None

class AgentConfig(BaseModel):
    """
    Agent Configuration schema.
    NOTE: In Pydantic V2, 'model_config' is a reserved attribute name for ConfigDict.
    To maintain the external API contract where the field is named 'model_config', 
    we use 'llm_config' internally with an alias.
    """
    model_config = ConfigDict(
        extra="forbid", 
        populate_by_name=True,  # Allows internal 'llm_config' or external 'model_config'
        protected_namespaces=() # Avoid warning for model_ prefix
    )
    
    system_prompt: str
    # Alias ensures external JSON uses 'model_config' while internal Python uses 'llm_config'
    llm_config: ModelConfig = Field(alias="model_config")
    tools: List[str] = Field(default_factory=list)
    constraints: Dict[str, Any] = Field(default_factory=lambda: {"max_steps": 5})

class AgentRead(AgentConfig):
    id: UUID4

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
