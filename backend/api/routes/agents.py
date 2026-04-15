import uuid
import jwt
from typing import Optional, Dict, Any
from fastapi import APIRouter, Depends, Header, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from backend.core.database import get_db
from backend.core.config import settings
from backend.core.logging import get_request_id, set_team_id
from backend.services.agent_service import AgentService
from backend.services.execution_engine import execution_engine
from backend.services.competition_manager_service import competition_manager_service
from backend.core.rate_limiter import LimitStatus
from backend.models.schemas import (
    AgentConfig, AgentRead, BaseResponse, AgentCreateResponse, ExecuteAgentRequest, ExecuteAgentResponse
)
from backend.models.constants import ResponseCode

from backend.api.dependencies import get_current_user
from backend.core.exceptions import NotFoundException, QuotaException

router = APIRouter(prefix="/agents", tags=["Agents"])

@router.post("", response_model=BaseResponse[AgentCreateResponse])
async def create_agent(
    config: AgentConfig,
    db: AsyncSession = Depends(get_db),
    auth: Dict[str, Any] = Depends(get_current_user)
):
    """
    Create a new agent with strict contract validation.
    """
    agent = await AgentService.create_agent(db, config)
    return BaseResponse.success(
        data=AgentCreateResponse(id=agent.id),
        message="Created successfully"
    )

@router.get("/{id}", response_model=BaseResponse[AgentRead])
async def get_agent(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    auth: Dict[str, Any] = Depends(get_current_user)
):
    """
    Get agent details.
    """
    agent = await AgentService.get_agent(db, id)
    if not agent:
        raise NotFoundException(f"Agent with ID {id} not found")
    
    return BaseResponse.success(data=agent, message="OK")

@router.post("/{id}/execute", response_model=BaseResponse[ExecuteAgentResponse])
async def execute_agent(
    id: uuid.UUID,
    request: ExecuteAgentRequest,
    db: AsyncSession = Depends(get_db),
    auth: Dict[str, Any] = Depends(get_current_user)
):
    agent = await AgentService.get_agent(db, id)
    if not agent:
        raise NotFoundException(f"Agent with ID {id} not found")
    
    team_id = auth["team_id"]
    
    # Check rate limit
    rate_status = await competition_manager_service.check_team_rate_limit(team_id)
    if rate_status == LimitStatus.EXCEEDED:
        raise QuotaException("Rate limit exceeded. Please wait and try again.", code=ResponseCode.RATE_LIMIT_EXCEEDED)
    if rate_status == LimitStatus.INFRA_ERROR:
        # Will be caught by global handler
        raise Exception("Internal service error during rate limit validation.")
        
    # Check token limit
    token_status = await competition_manager_service.check_team_token_limit(team_id)
    if token_status == LimitStatus.EXCEEDED:
        raise QuotaException("Token quota exhausted for this team.", code=ResponseCode.QUOTA_EXCEEDED)
    if token_status == LimitStatus.INFRA_ERROR:
        raise Exception("Internal service error during quota validation.")
        
    request_id = get_request_id()
    result = await execution_engine.run(
        agent=agent,
        input_data=request.input,
        team_id=team_id,
        request_id=request_id
    )
    return BaseResponse.success(
        data=ExecuteAgentResponse(
            execution_id=result.execution_id,
            final_state=result.final_state,
            termination_reason=result.termination_reason,
            steps_used=result.steps_used,
            request_id=request_id
        ),
        message="OK"
    )
