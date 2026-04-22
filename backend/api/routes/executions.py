import uuid
from fastapi import APIRouter, Depends
from backend.models.schemas import BaseResponse
from backend.services.execution_log_service import execution_log_service
from backend.api.dependencies import get_current_user
from backend.core.logging import logger
from backend.core.exceptions import NotFoundException
from backend.models.schemas import AuthContext
from backend.services.authorization_service import authorization_service

router = APIRouter(prefix="/executions", tags=["Executions"])

@router.get("/{execution_id}", response_model=BaseResponse[dict])
async def get_execution(
    execution_id: uuid.UUID,
    auth: AuthContext = Depends(get_current_user)
):
    await authorization_service.ensure_execution_record_ownership(auth, execution_id)
    result = await execution_log_service.get_execution_replay(execution_id, team_id=uuid.UUID(auth.team_id))
    if result is None:
        raise NotFoundException(f"Execution with ID {execution_id} not found or access denied")
    logger.bind(
        resource_type="execution_record",
        resource_id=str(execution_id),
    ).info(f"resource access log: read execution record {execution_id}")
    return BaseResponse.success(data=result, message="OK")
