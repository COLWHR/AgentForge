from fastapi import APIRouter, Depends, HTTPException
from backend.models.schemas import BaseResponse, TeamQuotaStatusData
from backend.api.dependencies import get_current_user, verify_team_permission
from backend.services.competition_manager_service import competition_manager_service

router = APIRouter(prefix="/teams", tags=["Teams"])

@router.get("/{team_id}/quota", response_model=BaseResponse[TeamQuotaStatusData])
async def get_team_quota(
    team_id: str, 
    auth_team_id: str = Depends(verify_team_permission)
):
    quota = await competition_manager_service.get_team_quota_status(
        team_id=team_id
    )
    return BaseResponse.success(data=quota, message="OK")
