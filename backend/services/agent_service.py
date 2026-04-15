import uuid
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from backend.models.orm import Agent
from backend.models.schemas import AgentConfig, AgentRead

class AgentService:
    @staticmethod
    async def create_agent(db: AsyncSession, config: AgentConfig) -> AgentRead:
        # mode="json" ensures UUID and Enum are converted to JSON-safe types
        # by_alias=True ensures fields like llm_config are dumped as model_config
        agent_data = config.model_dump(mode="json", by_alias=True)
        
        db_agent = Agent(
            id=uuid.uuid4(),
            config=agent_data
        )
        db.add(db_agent)
        await db.commit()
        await db.refresh(db_agent)
        
        # Invert the dump for return
        return AgentRead(id=db_agent.id, **db_agent.config)

    @staticmethod
    async def get_agent(db: AsyncSession, agent_id: uuid.UUID) -> Optional[AgentRead]:
        result = await db.execute(select(Agent).where(Agent.id == agent_id))
        db_agent = result.scalar_one_or_none()
        
        if db_agent:
            return AgentRead(id=db_agent.id, **db_agent.config)
        return None

# Global instance
agent_service = AgentService()
