import uuid
from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from backend.models.orm import Agent, AgentOwnership
from backend.models.schemas import AgentCreateRequest, AgentRead, AgentUpdateRequest
from backend.core.security import encrypt_api_key, validate_provider_url

class AgentService:
    @staticmethod
    def _to_agent_read(db_agent: Agent) -> AgentRead:
        cfg = db_agent.config or {}
        runtime_config = cfg.get("runtime_config") if isinstance(cfg.get("runtime_config"), dict) else {}
        capability_flags = cfg.get("capability_flags") if isinstance(cfg.get("capability_flags"), dict) else {}
        tools = cfg.get("tools") if isinstance(cfg.get("tools"), list) else []
        constraints = cfg.get("constraints") if isinstance(cfg.get("constraints"), dict) else {"max_steps": 6}
        name = cfg.get("name") if isinstance(cfg.get("name"), str) else ""
        if not name.strip():
            name = "Untitled Agent"
        return AgentRead(
            id=db_agent.id,
            name=name,
            description=cfg.get("description", ""),
            avatar_url=cfg.get("avatar_url"),
            llm_provider_url=cfg.get("llm_provider_url", ""),
            llm_model_name=cfg.get("llm_model_name", ""),
            runtime_config={
                "temperature": runtime_config.get("temperature", 0.7),
                "max_tokens": runtime_config.get("max_tokens"),
            },
            capability_flags={
                "supports_tools": bool(capability_flags.get("supports_tools", True)),
            },
            tools=tools,
            constraints=constraints,
            has_api_key=bool(cfg.get("llm_api_key_encrypted")),
        )

    @staticmethod
    async def create_agent(db: AsyncSession, config: AgentCreateRequest, team_id: str) -> AgentRead:
        validate_provider_url(config.llm_provider_url)
        agent_data = config.model_dump(mode="json")
        agent_data["llm_api_key_encrypted"] = encrypt_api_key(config.llm_api_key)
        agent_data.pop("llm_api_key", None)

        db_agent = Agent(
            id=uuid.uuid4(),
            config=agent_data
        )
        db.add(db_agent)
        db.add(
            AgentOwnership(
                agent_id=db_agent.id,
                team_id=uuid.UUID(team_id),
            )
        )
        await db.commit()
        await db.refresh(db_agent)
        return AgentService._to_agent_read(db_agent)

    @staticmethod
    async def list_agents(db: AsyncSession, team_id: str) -> List[AgentRead]:
        ownership_stmt = select(AgentOwnership.agent_id).where(AgentOwnership.team_id == uuid.UUID(team_id))
        ownership_rows = await db.execute(ownership_stmt)
        agent_ids = [row[0] for row in ownership_rows.fetchall()]
        if not agent_ids:
            return []
        agent_stmt = select(Agent).where(Agent.id.in_(agent_ids))
        rows = await db.execute(agent_stmt)
        agents = rows.scalars().all()
        return [AgentService._to_agent_read(a) for a in agents]

    @staticmethod
    async def get_agent(db: AsyncSession, agent_id: uuid.UUID) -> Optional[AgentRead]:
        result = await db.execute(select(Agent).where(Agent.id == agent_id))
        db_agent = result.scalar_one_or_none()
        
        if db_agent:
            return AgentService._to_agent_read(db_agent)
        return None

    @staticmethod
    async def get_agent_raw(db: AsyncSession, agent_id: uuid.UUID) -> Optional[Agent]:
        result = await db.execute(select(Agent).where(Agent.id == agent_id))
        return result.scalar_one_or_none()

    @staticmethod
    async def update_agent(db: AsyncSession, agent_id: uuid.UUID, payload: AgentUpdateRequest) -> Optional[AgentRead]:
        db_agent = await AgentService.get_agent_raw(db, agent_id)
        if db_agent is None:
            return None

        incoming = payload.model_dump(exclude_none=True, mode="json")
        if "llm_provider_url" in incoming:
            validate_provider_url(incoming["llm_provider_url"])
        if "llm_api_key" in incoming:
            incoming["llm_api_key_encrypted"] = encrypt_api_key(incoming.pop("llm_api_key"))

        next_config = dict(db_agent.config or {})
        next_config.update(incoming)
        db_agent.config = next_config
        await db.commit()
        await db.refresh(db_agent)
        return AgentService._to_agent_read(db_agent)

    @staticmethod
    async def get_agent_owner_team_id(db: AsyncSession, agent_id: uuid.UUID) -> Optional[str]:
        result = await db.execute(
            select(AgentOwnership).where(AgentOwnership.agent_id == agent_id)
        )
        ownership = result.scalar_one_or_none()
        if ownership is None:
            return None
        return str(ownership.team_id)

# Global instance
agent_service = AgentService()
