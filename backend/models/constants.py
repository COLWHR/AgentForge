from enum import Enum

class ResponseCode(int, Enum):
    SUCCESS = 0
    
    # 1000: General & Validation Errors
    INTERNAL_ERROR = 1000
    VALIDATION_ERROR = 1001
    NOT_FOUND = 1002
    DATABASE_ERROR = 1003
    
    # 2000: Model Gateway Errors
    MODEL_ERROR = 2000
    MODEL_TIMEOUT = 2001
    
    # 3000: Tool Runtime Errors
    TOOL_ERROR = 3000
    
    # 4000: Sandbox Errors
    SANDBOX_ERROR = 4000
    
    # 5000: Quota & Auth Errors
    AUTH_REQUIRED = 5000
    TOKEN_INVALID = 5001
    TOKEN_EXPIRED = 5002
    PERMISSION_DENIED = 5003
    TEAM_FORBIDDEN = 5004
    QUOTA_EXCEEDED = 5005
    RATE_LIMIT_EXCEEDED = 5006
    
    # Engine specific (if needed, map to 1000 or similar)
    ENGINE_ERROR = 1010

class ExecutionState(str, Enum):
    INIT = "INIT"
    THINKING = "THINKING"
    ACTING = "ACTING"
    OBSERVING = "OBSERVING"
    FINISHED = "FINISHED"
    TERMINATED = "TERMINATED"

class TerminationReason(str, Enum):
    SUCCESS = "SUCCESS"
    MAX_STEPS_REACHED = "MAX_STEPS_REACHED"
    MODEL_OUTPUT_TRUNCATED = "MODEL_OUTPUT_TRUNCATED"
    FAILED = "FAILED"

class ActionType(str, Enum):
    TOOL_CALL = "tool_call"
    FINISH = "finish"
    ERROR = "error"

class QuotaStatus(str, Enum):
    ACTIVE = "ACTIVE"
    EXHAUSTED = "EXHAUSTED"
    RATE_LIMITED = "RATE_LIMITED"


class ExecutionStatus(str, Enum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    SUCCEEDED = "SUCCEEDED"
    FAILED = "FAILED"
    TERMINATED = "TERMINATED"


class ArcErrorCode(str, Enum):
    MISSING_API_KEY = "MISSING_API_KEY"
    INVALID_ENDPOINT = "INVALID_ENDPOINT"
    AUTH_FAILED = "AUTH_FAILED"
    MODEL_NOT_FOUND = "MODEL_NOT_FOUND"
    MODEL_CAPABILITY_MISMATCH = "MODEL_CAPABILITY_MISMATCH"
    INVALID_TOOL_CALL = "INVALID_TOOL_CALL"
    PROVIDER_RATE_LIMITED = "PROVIDER_RATE_LIMITED"
    MODEL_OUTPUT_TRUNCATED = "MODEL_OUTPUT_TRUNCATED"
    NETWORK_ERROR = "NETWORK_ERROR"
