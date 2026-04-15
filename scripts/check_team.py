import asyncio
import uuid
from backend.core.database import AsyncSessionLocal
from backend.models.orm import Team, TeamQuota
from backend.core.config import settings

async def check_or_create_team():
    from backend.core.database import engine, Base
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        
    async with AsyncSessionLocal() as session:
        from sqlalchemy import select
        result = await session.execute(select(Team))
        team = result.scalars().first()
        if not team:
            print("No team found, creating default team...")
            team = Team(id=uuid.UUID("00000000-0000-0000-0000-000000000001"), name="Team Alpha", status="ACTIVE")
            session.add(team)
            quota = TeamQuota(team_id=team.id, token_limit=1000000, rate_limit=100)
            session.add(quota)
            await session.commit()
            print(f"Created team: {team.id}")
        else:
            print(f"Found team: {team.id}, Name: {team.name}")
        return team.id

if __name__ == "__main__":
    loop = asyncio.get_event_loop()
    team_id = loop.run_until_complete(check_or_create_team())
    print(f"TEAM_ID={team_id}")
