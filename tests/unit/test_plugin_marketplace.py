import json
import uuid

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from plugin_marketplace.db.database import Base


@pytest.mark.asyncio
async def test_marketplace_seeds_manifests_and_executes_builtin_tool(tmp_path):
    from plugin_marketplace import MarketplaceAPI

    db_path = tmp_path / "marketplace.db"
    database_url = f"sqlite+aiosqlite:///{db_path}"
    engine = create_async_engine(database_url, future=True)
    session_factory = async_sessionmaker(bind=engine, expire_on_commit=False)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    api = MarketplaceAPI(database_url=database_url, session_factory=session_factory)
    await api.initialize()

    manifests = await api.list_extensions()
    manifest_ids = {item["id"] for item in manifests}
    assert {"github", "filesystem", "brave_search", "builtin"}.issubset(manifest_ids)

    user_id = str(uuid.uuid4())
    await api.install_extension("builtin", user_id, {})
    tools = await api.list_extension_tools("builtin")
    tool_ids = {tool["id"] for tool in tools}
    assert "builtin/echo" in tool_ids

    result = await api.execute_tool(
        "builtin/echo",
        {"text": "hello"},
        context={"user_id": user_id},
    )
    payload = json.loads(result)
    assert payload["echo"] == "hello"

    await engine.dispose()


def test_marketplace_router_lists_seeded_extensions(tmp_path):
    from plugin_marketplace import MarketplaceAPI
    from plugin_marketplace.api.routes import create_router

    async def _build_api():
        db_path = tmp_path / "marketplace-api.db"
        database_url = f"sqlite+aiosqlite:///{db_path}"
        engine = create_async_engine(database_url, future=True)
        session_factory = async_sessionmaker(bind=engine, expire_on_commit=False)
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        api = MarketplaceAPI(database_url=database_url, session_factory=session_factory)
        await api.initialize()
        return api, engine

    import asyncio

    api, engine = asyncio.run(_build_api())

    app = FastAPI()
    app.state.pm_api = api
    app.include_router(create_router())

    with TestClient(app) as client:
        response = client.get("/api/v1/marketplace/extensions")
        assert response.status_code == 200
        payload = response.json()
        ids = {item["id"] for item in payload}
        assert "github" in ids
        assert "builtin" in ids

    asyncio.run(engine.dispose())


def test_marketplace_router_tests_extension_configuration(tmp_path):
    from plugin_marketplace import MarketplaceAPI
    from plugin_marketplace.api.routes import create_router

    async def _build_api():
        db_path = tmp_path / "marketplace-config-api.db"
        database_url = f"sqlite+aiosqlite:///{db_path}"
        engine = create_async_engine(database_url, future=True)
        session_factory = async_sessionmaker(bind=engine, expire_on_commit=False)
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        api = MarketplaceAPI(database_url=database_url, session_factory=session_factory)
        await api.initialize()
        return api, engine

    import asyncio

    api, engine = asyncio.run(_build_api())

    app = FastAPI()
    app.state.pm_api = api
    app.include_router(create_router())

    with TestClient(app) as client:
        response = client.post(
            "/api/v1/marketplace/extensions/filesystem/test-connection",
            json={"config": {"root_path": "Z:\\does-not-exist"}},
        )
        assert response.status_code == 200
        payload = response.json()
        assert payload["ok"] is False
        assert "Path does not exist" in payload["message"]

    asyncio.run(engine.dispose())


@pytest.mark.asyncio
async def test_marketplace_initialization_registers_adapters_for_seeded_extensions(tmp_path):
    from plugin_marketplace import MarketplaceAPI

    db_path = tmp_path / "marketplace-install.db"
    database_url = f"sqlite+aiosqlite:///{db_path}"
    engine = create_async_engine(database_url, future=True)
    session_factory = async_sessionmaker(bind=engine, expire_on_commit=False)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    api = MarketplaceAPI(database_url=database_url, session_factory=session_factory)
    await api.initialize()

    assert {"builtin", "github", "filesystem", "brave_search"}.issubset(set(api._adapters.keys()))

    await engine.dispose()


@pytest.mark.asyncio
async def test_extension_config_fields_and_connection_validation(tmp_path):
    from plugin_marketplace import MarketplaceAPI

    db_path = tmp_path / "marketplace-config.db"
    database_url = f"sqlite+aiosqlite:///{db_path}"
    engine = create_async_engine(database_url, future=True)
    session_factory = async_sessionmaker(bind=engine, expire_on_commit=False)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    api = MarketplaceAPI(database_url=database_url, session_factory=session_factory)
    await api.initialize()

    extensions = await api.list_extensions()
    filesystem = next(item for item in extensions if item["id"] == "filesystem")
    assert any(field["key"] == "root_path" for field in filesystem["config_fields"])

    result = await api.test_extension_connection("filesystem", {"root_path": "Z:\\does-not-exist"})
    assert result["ok"] is False
    assert "Path does not exist" in result["message"]

    await engine.dispose()
