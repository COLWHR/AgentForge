import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy import DateTime, func, JSON, Uuid
from sqlalchemy.orm import Mapped, mapped_column
from backend.core.database import Base

class Agent(Base):
    __tablename__ = "agents"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, 
        primary_key=True, 
        default=uuid.uuid4
    )
    config: Mapped[dict] = mapped_column(JSON, nullable=False)

    def __repr__(self) -> str:
        return f"<Agent(id={self.id})>"

class ExecutionLog(Base):
    __tablename__ = "execution_logs"

    execution_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    team_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, index=True)
    request_id: Mapped[str] = mapped_column(nullable=False, index=True)
    agent_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, index=True)
    status: Mapped[str] = mapped_column(nullable=False)
    final_state: Mapped[str] = mapped_column(nullable=False)
    termination_reason: Mapped[str] = mapped_column(nullable=False)
    steps_used: Mapped[int] = mapped_column(default=0)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    final_answer: Mapped[Optional[str]] = mapped_column(nullable=True)
    error_code: Mapped[Optional[str]] = mapped_column(nullable=True)
    error_source: Mapped[Optional[str]] = mapped_column(nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(nullable=True)
    data: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

    def __repr__(self) -> str:
        return f"<ExecutionLog(id={self.execution_id}, status={self.status})>"

class ReactStepLog(Base):
    __tablename__ = "react_steps"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    execution_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, index=True)
    step_index: Mapped[int] = mapped_column(nullable=False)
    request_id: Mapped[str] = mapped_column(nullable=False)
    step_status: Mapped[str] = mapped_column(nullable=False)
    state_before: Mapped[Optional[str]] = mapped_column(nullable=True)
    state_after: Mapped[Optional[str]] = mapped_column(nullable=True)
    thought: Mapped[Optional[str]] = mapped_column(nullable=True)
    action: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    observation: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    error_code: Mapped[Optional[str]] = mapped_column(nullable=True)
    error_source: Mapped[Optional[str]] = mapped_column(nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    def __repr__(self) -> str:
        return f"<ReactStepLog(execution_id={self.execution_id}, step={self.step_index})>"

class Team(Base):
    __tablename__ = "teams"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid, 
        primary_key=True, 
        default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(nullable=False)
    status: Mapped[str] = mapped_column(nullable=False, default="ACTIVE") # ACTIVE / DISABLED
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def __repr__(self) -> str:
        return f"<Team(id={self.id}, name={self.name}, status={self.status})>"

class TeamQuota(Base):
    __tablename__ = "team_quotas"

    team_id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True)
    token_limit: Mapped[int] = mapped_column(nullable=False)
    rate_limit: Mapped[int] = mapped_column(nullable=False)

    def __repr__(self) -> str:
        return f"<TeamQuota(team_id={self.team_id}, token_limit={self.token_limit})>"
