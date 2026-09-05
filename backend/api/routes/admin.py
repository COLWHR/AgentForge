from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.dependencies import get_current_user
from backend.core.database import get_db
from backend.models.orm import Team, User
from backend.models.schemas import AuthContext, BaseResponse
from backend.services.authorization_service import authorization_service

router = APIRouter(prefix="/admin", tags=["Admin"])


@router.get("/overview", response_model=BaseResponse[dict])
async def get_admin_overview(
    auth: AuthContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await authorization_service.ensure_platform_admin(auth)
    users_total = await db.scalar(select(func.count()).select_from(User))
    teams_total = await db.scalar(select(func.count()).select_from(Team))
    return BaseResponse.success(
        data={
            "status": "ok",
            "users_total": int(users_total or 0),
            "teams_total": int(teams_total or 0),
        },
        message="OK",
    )
