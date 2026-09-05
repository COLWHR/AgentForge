import jwt
from uuid import UUID

from backend.core.config import settings

TEST_TEAM_ID = UUID("00000000-0000-0000-0000-000000000001")


def _auth_headers(*, user_id: str = "user-integration", team_id: str = str(TEST_TEAM_ID), is_platform_admin: bool = False) -> dict[str, str]:
    payload = {
        "user_id": user_id,
        "team_id": team_id,
        "role": "owner" if is_platform_admin else "member",
        "search_id": 101,
        "email": f"{user_id}@example.com",
        "email_verified": True,
        "is_platform_admin": is_platform_admin,
    }
    token = jwt.encode(payload, settings.JWT_SECRET, algorithm="HS256")
    return {"Authorization": f"Bearer {token}"}


def test_non_admin_cannot_access_admin_overview(client):
    response = client.get("/admin/overview", headers=_auth_headers())
    assert response.status_code == 403


def test_platform_admin_can_access_admin_overview(client, db_session):
    response = client.get("/admin/overview", headers=_auth_headers(is_platform_admin=True))
    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["status"] == "ok"
