import pytest
import jwt
from unittest.mock import AsyncMock, patch
from datetime import datetime, timedelta, timezone

from backend.api.dependencies import get_current_user, verify_team_permission
from backend.core.config import settings
from backend.core.exceptions import AuthException, PermissionException, NotFoundException
from backend.models.constants import ResponseCode

@pytest.mark.asyncio
async def test_get_current_user_no_token():
    with pytest.raises(AuthException) as exc:
        await get_current_user(authorization=None)
    assert exc.value.code == ResponseCode.AUTH_REQUIRED

@pytest.mark.asyncio
async def test_get_current_user_invalid_token():
    with pytest.raises(AuthException) as exc:
        await get_current_user(authorization="Bearer invalid.token.here")
    assert exc.value.code == ResponseCode.TOKEN_INVALID

@pytest.mark.asyncio
async def test_get_current_user_expired_token():
    payload = {
        "user_id": "user1",
        "team_id": "team1",
        "exp": datetime.now(timezone.utc) - timedelta(hours=1)
    }
    token = jwt.encode(payload, settings.JWT_SECRET, algorithm="HS256")
    
    with pytest.raises(AuthException) as exc:
        await get_current_user(authorization=f"Bearer {token}")
    assert exc.value.code == ResponseCode.TOKEN_EXPIRED

@pytest.mark.asyncio
async def test_get_current_user_valid_token():
    payload = {
        "user_id": "user1",
        "team_id": "team1",
        "exp": datetime.now(timezone.utc) + timedelta(hours=1)
    }
    token = jwt.encode(payload, settings.JWT_SECRET, algorithm="HS256")
    
    class MockTeam:
        status = "ACTIVE"
        
    with patch("backend.api.dependencies.competition_manager_service.get_team", new_callable=AsyncMock) as mock_get_team:
        mock_get_team.return_value = MockTeam()
        user = await get_current_user(authorization=f"Bearer {token}")
        assert user["user_id"] == "user1"
        assert user["team_id"] == "team1"

@pytest.mark.asyncio
async def test_verify_team_permission():
    auth = {"user_id": "user1", "team_id": "team1"}
    
    # Same team -> OK
    res = await verify_team_permission("team1", auth=auth)
    assert res == "team1"
    
    # Different team -> Error
    with pytest.raises(PermissionException) as exc:
        await verify_team_permission("team2", auth=auth)
    assert exc.value.code == ResponseCode.TEAM_FORBIDDEN
