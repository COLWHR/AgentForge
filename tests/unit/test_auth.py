import pytest
import jwt
from unittest.mock import AsyncMock, patch
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from backend.api.dependencies import resolve_auth_context, verify_team_permission
from backend.core.config import settings
from backend.core.exceptions import AuthException, PermissionException
from backend.models.constants import ResponseCode
from backend.models.schemas import AuthContext


def _request_with_request_id(request_id: str = "req-test"):
    return SimpleNamespace(
        method="GET",
        url=SimpleNamespace(path="/test"),
        state=SimpleNamespace(request_id=request_id),
    )

@pytest.mark.asyncio
async def test_resolve_auth_context_no_token():
    with pytest.raises(AuthException) as exc:
        await resolve_auth_context(request=_request_with_request_id(), authorization=None)
    assert exc.value.code == ResponseCode.AUTH_REQUIRED

@pytest.mark.asyncio
async def test_resolve_auth_context_invalid_token():
    with pytest.raises(AuthException) as exc:
        await resolve_auth_context(request=_request_with_request_id(), authorization="Bearer invalid.token.here")
    assert exc.value.code == ResponseCode.TOKEN_INVALID

@pytest.mark.asyncio
async def test_resolve_auth_context_expired_token():
    payload = {
        "user_id": "user1",
        "team_id": "team1",
        "exp": datetime.now(timezone.utc) - timedelta(hours=1)
    }
    token = jwt.encode(payload, settings.JWT_SECRET, algorithm="HS256")
    
    with pytest.raises(AuthException) as exc:
        await resolve_auth_context(request=_request_with_request_id(), authorization=f"Bearer {token}")
    assert exc.value.code == ResponseCode.TOKEN_EXPIRED

@pytest.mark.asyncio
async def test_resolve_auth_context_valid_token():
    payload = {
        "user_id": "user1",
        "team_id": "team1",
        "exp": datetime.now(timezone.utc) + timedelta(hours=1)
    }
    token = jwt.encode(payload, settings.JWT_SECRET, algorithm="HS256")
    
    auth = await resolve_auth_context(request=_request_with_request_id(), authorization=f"Bearer {token}")
    assert auth.user_id == "user1"
    assert auth.team_id == "team1"
    assert auth.auth_mode == "jwt"

@pytest.mark.asyncio
async def test_verify_team_permission():
    auth = AuthContext(
        user_id="user1",
        team_id="team1",
        auth_mode="jwt",
        request_id="req-test",
    )
    class MockTeam:
        status = "ACTIVE"
    
    # Same team -> OK
    with patch("backend.api.dependencies.competition_manager_service.get_team", new_callable=AsyncMock) as mock_get_team:
        mock_get_team.return_value = MockTeam()
        res = await verify_team_permission("team1", auth=auth)
    assert res == "team1"
    
    # Different team -> Error
    with patch("backend.api.dependencies.competition_manager_service.get_team", new_callable=AsyncMock) as mock_get_team:
        mock_get_team.return_value = MockTeam()
        with pytest.raises(PermissionException) as exc:
            await verify_team_permission("team2", auth=auth)
    assert exc.value.code == ResponseCode.TEAM_FORBIDDEN
