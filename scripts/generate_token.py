import jwt
import datetime
from datetime import timezone
import uuid

# Phase 7 stable secret - must match backend/core/config.py
SECRET = "agentforge-secret-key-phase-7"
ALGORITHM = "HS256"

def generate_token(user_id: str = "user_admin", team_id: str = "00000000-0000-0000-0000-000000000001", days: int = 1):
    """
    Generate a standard JWT token for development/testing.
    Fixes datetime.utcnow() deprecation by using timezone-aware UTC.
    """
    payload = {
        "user_id": user_id,
        "team_id": team_id,
        "exp": datetime.datetime.now(timezone.utc) + datetime.timedelta(days=days)
    }
    token = jwt.encode(payload, SECRET, algorithm=ALGORITHM)
    return token

if __name__ == "__main__":
    # Default execution outputs only the token to stdout for easy capture by shell scripts
    print(generate_token())
