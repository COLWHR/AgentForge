import pytest
import asyncio
import uuid
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.pool import NullPool
from fastapi.testclient import TestClient

from backend.main import app
from backend.core.database import get_db, Base
import backend.core.database as core_db
import backend.services.execution_log_service as log_service
import backend.services.model_gateway as model_gateway
import backend.services.competition_manager_service as comp_service
from backend.core.config import settings
from backend.models.orm import Team, TeamQuota

# Use the test database URL from .env.test
TEST_DB_URL = settings.DB_URL

# Use NullPool for tests to avoid "another operation is in progress" issues
test_engine = create_async_engine(TEST_DB_URL, echo=False, poolclass=NullPool)
TestingSessionLocal = async_sessionmaker(
    bind=test_engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

# CRITICAL: Override global database objects in ALL relevant modules
core_db.engine = test_engine
core_db.AsyncSessionLocal = TestingSessionLocal
log_service.AsyncSessionLocal = TestingSessionLocal
model_gateway.AsyncSessionLocal = TestingSessionLocal
comp_service.AsyncSessionLocal = TestingSessionLocal

# Test constants
TEST_TEAM_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")
TEST_TEAM_NAME = "Test Team"

async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
    async with TestingSessionLocal() as session:
        yield session

app.dependency_overrides[get_db] = override_get_db

@pytest.fixture(autouse=True)
async def setup_database():
    try:
        async with test_engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
            await conn.run_sync(Base.metadata.create_all)
        
        # Seed mandatory test data
        async with TestingSessionLocal() as session:
            test_team = Team(id=TEST_TEAM_ID, name=TEST_TEAM_NAME, status="ACTIVE")
            test_quota = TeamQuota(team_id=TEST_TEAM_ID, token_limit=1000000, rate_limit=100)
            session.add(test_team)
            session.add(test_quota)
            await session.commit()
            
        yield
    except Exception as e:
        print(f"Failed to setup test database: {e}")
        yield
    finally:
        try:
            async with test_engine.begin() as conn:
                await conn.run_sync(Base.metadata.drop_all)
        except Exception:
            pass

@pytest.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    async with TestingSessionLocal() as session:
        yield session

@pytest.fixture
def client() -> TestClient:
    # Use TestClient without 'with' block to avoid startup/lifespan conflicts with setup_database
    return TestClient(app)
