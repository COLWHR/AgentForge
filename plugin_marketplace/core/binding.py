"""
plugin_marketplace.core.binding
Agent-tool binding service.
"""

from typing import Any, Dict, List, Optional
import uuid as uuid_lib

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from plugin_marketplace.db import PMAgentTool, PMTool


class AgentToolBindingService:
    """Manages which tools are bound to which agents."""

    def __init__(self, session_or_factory):
        if isinstance(session_or_factory, async_sessionmaker):
            self._session_factory = session_or_factory
            self._session = None
        else:
            self._session = session_or_factory
            self._session_factory = None

    async def _get_session(self) -> AsyncSession:
        if self._session_factory:
            return self._session_factory()
        return self._session

    async def _close_session(self, session: AsyncSession) -> None:
        if self._session_factory:
            await session.close()

    async def bind_tools(self, agent_id: str, tool_ids: List[str]) -> None:
        """
        Bind tools to an agent.
        """
        session = await self._get_session()
        try:
            for tool_id in tool_ids:
                tool_uuid = await self._resolve_tool_uuid(session, tool_id)
                if not tool_uuid:
                    continue

                query = select(PMAgentTool).where(
                    and_(
                        PMAgentTool.agent_id == agent_id,
                        PMAgentTool.tool_id == tool_uuid,
                    )
                )
                result = await session.execute(query)
                existing = result.scalar_one_or_none()
                if existing:
                    continue

                binding = PMAgentTool(
                    agent_id=agent_id,
                    tool_id=tool_uuid,
                    enabled=True,
                )
                session.add(binding)

            await session.commit()
        finally:
            await self._close_session(session)

    async def unbind_tools(self, agent_id: str, tool_ids: List[str]) -> None:
        """
        Unbind tools from an agent.
        """
        session = await self._get_session()
        try:
            for tool_id in tool_ids:
                tool_uuid = await self._resolve_tool_uuid(session, tool_id)
                if not tool_uuid:
                    continue

                query = select(PMAgentTool).where(
                    and_(
                        PMAgentTool.agent_id == agent_id,
                        PMAgentTool.tool_id == tool_uuid,
                    )
                )
                result = await session.execute(query)
                binding = result.scalar_one_or_none()
                if binding:
                    await session.delete(binding)

            await session.commit()
        finally:
            await self._close_session(session)

    async def get_agent_tools(self, agent_id: str) -> List[Dict[str, Any]]:
        """
        Get all tools bound to an agent.
        Returns tool schemas in OpenAI function calling format.
        """
        session = await self._get_session()
        try:
            query = (
                select(PMAgentTool, PMTool)
                .join(PMTool, PMAgentTool.tool_id == PMTool.id)
                .where(
                    and_(
                        PMAgentTool.agent_id == agent_id,
                        PMAgentTool.enabled.is_(True),
                        PMTool.enabled.is_(True),
                    )
                )
            )
            result = await session.execute(query)
            rows = result.all()

            tools = []
            for _binding, tool in rows:
                schema = {
                    "type": "function",
                    "function": {
                        "name": f"{tool.extension_id}/{tool.name}",
                        "description": tool.description or "",
                        "parameters": tool.input_schema or {"type": "object", "properties": {}},
                    },
                }
                tools.append(schema)
            return tools
        finally:
            await self._close_session(session)

    async def _resolve_tool_uuid(self, session: AsyncSession, tool_id: str) -> Optional[uuid_lib.UUID]:
        """
        Resolve a tool identifier to a UUID.
        tool_id can be:
          - "extension_id/tool_name" format
          - A UUID string
        """
        # Try as UUID first
        try:
            return uuid_lib.UUID(tool_id)
        except ValueError:
            pass

        # Try as "extension_id/tool_name"
        parts = tool_id.split("/", 1)
        if len(parts) == 2:
            ext_id, tool_name = parts
            query = select(PMTool).where(
                and_(
                    PMTool.extension_id == ext_id,
                    PMTool.name == tool_name,
                )
            )
            result = await session.execute(query)
            tool = result.scalar_one_or_none()
            if tool:
                return tool.id
        return None
