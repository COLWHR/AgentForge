import uuid
from typing import Any, Dict, List, Optional

from backend.core.config import settings
from backend.core.database import AsyncSessionLocal
from plugin_marketplace import MarketplaceAPI


class MarketplaceToolAdapter:
    """
    Adapter that enforces tool access through plugin marketplace only.
    """

    def __init__(self, marketplace_api: Optional[MarketplaceAPI] = None):
        self._marketplace_api = marketplace_api

    async def _get_api(self) -> MarketplaceAPI:
        if self._marketplace_api is None:
            self._marketplace_api = MarketplaceAPI(
                database_url=settings.DB_URL,
                session_factory=AsyncSessionLocal,
            )
            await self._marketplace_api.initialize()
        return self._marketplace_api

    async def get_tools_schema(self, agent_id: uuid.UUID) -> List[Dict[str, Any]]:
        api = await self._get_api()
        tools = await api.get_tools_for_agent(str(agent_id))
        return tools or []

    async def execute_tool(
        self,
        tool_id: str,
        arguments: Dict[str, Any],
        context: Dict[str, Any],
    ) -> str:
        api = await self._get_api()
        return await api.execute_tool(tool_id=tool_id, arguments=arguments, context=context)


marketplace_tool_adapter = MarketplaceToolAdapter()
