import uuid

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from plugin_marketplace import MarketplaceAPI
from plugin_marketplace.db.database import Base


@pytest.mark.asyncio
async def test_bind_and_get_tools_for_agent(tmp_path):
    db_path = tmp_path / "pm-binding.db"
    database_url = f"sqlite+aiosqlite:///{db_path}"
    engine = create_async_engine(database_url, future=True)
    session_factory = async_sessionmaker(bind=engine, expire_on_commit=False)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    api = MarketplaceAPI(database_url=database_url, session_factory=session_factory)
    await api.initialize()

    user_id = str(uuid.uuid4())
    agent_id = str(uuid.uuid4())

    await api.install_extension("builtin", user_id, {})
    await api.bind_tools_to_agent(agent_id, ["builtin/echo"])
    tools = await api.get_tools_for_agent(agent_id)

    assert len(tools) == 1
    assert tools[0]["function"]["name"] == "builtin/echo"

    await engine.dispose()
