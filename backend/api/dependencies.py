import jwt
from typing import Dict, Any, Optional
from fastapi import Header, Depends, HTTPException
from backend.core.config import settings
from backend.core.logging import set_team_id
from backend.services.competition_manager_service import competition_manager_service
from backend.core.exceptions import AuthException, PermissionException, NotFoundException
from backend.models.constants import ResponseCode

async def get_current_user(authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    """
    JWT Authentication dependency.
    Validates token and returns user/team context.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise AuthException("Authorization required", code=ResponseCode.AUTH_REQUIRED)
    
    token = authorization[7:]
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise AuthException("Token expired", code=ResponseCode.TOKEN_EXPIRED)
    except jwt.InvalidTokenError:
        raise AuthException("Invalid token", code=ResponseCode.TOKEN_INVALID)
    
    user_id = payload.get("user_id") or payload.get("sub")
    team_id = payload.get("team_id")
    
    if not user_id or not team_id:
        raise AuthException("Invalid token payload: missing user_id or team_id", code=ResponseCode.TOKEN_INVALID)
    
    # Verify team exists and is active
    team = await competition_manager_service.get_team(team_id)
    if not team:
        raise NotFoundException(f"Team {team_id} not found")
    if team.status != "ACTIVE":
        raise PermissionException(f"Team {team_id} is disabled", code=ResponseCode.TEAM_FORBIDDEN)
    
    set_team_id(team_id)
    return {
        "user_id": user_id,
        "team_id": team_id
    }

async def verify_team_permission(
    target_team_id: str,
    auth: Dict[str, Any] = Depends(get_current_user)
) -> str:
    """
    Authorization dependency.
    Verifies if the current user belongs to the target team.
    """
    if auth["team_id"] != target_team_id:
        raise PermissionException(
            f"Access denied: Team {auth['team_id']} cannot access resources of Team {target_team_id}",
            code=ResponseCode.TEAM_FORBIDDEN
        )
    return target_team_id
