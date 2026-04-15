from backend.models.tool import ToolResponse

from typing import Any, Dict
from fastapi import APIRouter, Body
from backend.core.tool_runtime import ToolExecutor
from backend.core.logging import get_request_id
from fastapi import APIRouter, Body, Depends
from backend.api.dependencies import get_current_user

router = APIRouter()

@router.post("/tools/execute", response_model=ToolResponse)
async def execute_tool(
    tool_name: str = Body(..., embed=True),
    input_data: Dict[str, Any] = Body(..., embed=True),
    auth: Dict[str, Any] = Depends(get_current_user)
) -> ToolResponse:
    """
    Minimum Tool Runtime API endpoint.
    Executes a registered tool and returns the structured response.
    """
    request_id = get_request_id()
    
    # Delegate to the ToolExecutor for the full execution flow
    # (including schema validation, logging, and error isolation)
    return ToolExecutor.execute(
        name=tool_name, 
        input_data=input_data, 
        request_id=request_id
    )
