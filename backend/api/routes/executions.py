import uuid
from typing import Dict, Any
from fastapi import APIRouter, Depends
from backend.models.schemas import BaseResponse
from backend.services.execution_log_service import execution_log_service
from backend.api.dependencies import get_current_user
from backend.core.exceptions import NotFoundException

router = APIRouter(prefix="/executions", tags=["Executions"])

@router.get("/{execution_id}", response_model=BaseResponse[dict])
async def get_execution(
    execution_id: uuid.UUID,
    auth: Dict[str, Any] = Depends(get_current_user)
):
    team_id = uuid.UUID(auth["team_id"])
    result = await execution_log_service.get_execution_replay(execution_id, team_id=team_id)
    if result is None:
        raise NotFoundException(f"Execution with ID {execution_id} not found or access denied")
    return BaseResponse.success(data=result, message="OK")
