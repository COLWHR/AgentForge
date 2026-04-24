import uuid
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from backend.core.database import get_db
from backend.core.logging import get_request_id, logger
from backend.services.agent_service import AgentService
from backend.services.agent_runtime_defaults import default_agent_tool_ids
from backend.services.execution_engine import execution_engine
from backend.services.competition_manager_service import competition_manager_service
from backend.services.marketplace_tool_adapter import marketplace_tool_adapter
from backend.services.authorization_service import authorization_service
from backend.core.rate_limiter import LimitStatus
from backend.models.schemas import (
    AgentCreateRequest,
    AgentRead,
    AgentUpdateRequest,
    AuthContext,
    BaseResponse,
    AgentCreateResponse,
    ExecuteAgentRequest,
    ExecuteAgentResponse,
)
from backend.models.constants import ResponseCode

from backend.api.dependencies import get_current_user
from backend.core.exceptions import NotFoundException, QuotaException
from backend.core.exceptions import ValidationException

router = APIRouter(prefix="/agents", tags=["Agents"])


async def _validate_requested_tools(tool_ids: list[str]) -> None:
    resolution = await marketplace_tool_adapter.validate_tool_ids(tool_ids)
    if resolution.missing_tool_ids:
        raise ValidationException(f"Invalid tool ids: {', '.join(resolution.missing_tool_ids)}")


def _effective_tool_ids(*, supports_tools: bool, tool_ids: list[str]) -> list[str]:
    if supports_tools and not tool_ids:
        return default_agent_tool_ids()
    return tool_ids

@router.post("", response_model=BaseResponse[AgentCreateResponse])
async def create_agent(
    config: AgentCreateRequest,
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(get_current_user)
):
    """
    Create a new agent with strict contract validation.
    """
    await authorization_service.validate_membership(auth)
    effective_tool_ids = _effective_tool_ids(
        supports_tools=config.capability_flags.supports_tools,
        tool_ids=list(config.tools),
    )
    if effective_tool_ids:
        await _validate_requested_tools(effective_tool_ids)
    config = config.model_copy(update={"tools": effective_tool_ids})
    agent = await AgentService.create_agent(db, config, team_id=auth.team_id)
    await marketplace_tool_adapter.sync_agent_tools(str(agent.id), effective_tool_ids)
    logger.bind(resource_type="agent", resource_id=str(agent.id)).info(
        f"resource access log: create agent {agent.id}"
    )
    return BaseResponse.success(
        data=AgentCreateResponse(id=agent.id),
        message="Created successfully"
    )

@router.get("", response_model=BaseResponse[list[AgentRead]])
async def list_agents(
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(get_current_user),
):
    await authorization_service.validate_membership(auth)
    agents = await AgentService.list_agents(db, team_id=auth.team_id)
    return BaseResponse.success(data=agents, message="OK")

@router.get("/{id}", response_model=BaseResponse[AgentRead])
async def get_agent(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(get_current_user)
):
    """
    Get agent details.
    """
    agent = await AgentService.get_agent(db, id)
    if not agent:
        raise NotFoundException(f"Agent with ID {id} not found")
    await authorization_service.ensure_agent_ownership(auth, id, operation="read")
    logger.bind(resource_type="agent", resource_id=str(id)).info(
        f"resource access log: read agent {id}"
    )
    return BaseResponse.success(data=agent, message="OK")


@router.patch("/{id}", response_model=BaseResponse[AgentRead])
async def patch_agent(
    id: uuid.UUID,
    payload: AgentUpdateRequest,
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(get_current_user),
):
    await authorization_service.ensure_agent_ownership(auth, id, operation="update")
    if payload.tools is not None:
        await _validate_requested_tools(payload.tools)
    agent = await AgentService.update_agent(db, id, payload)
    if not agent:
        raise NotFoundException(f"Agent with ID {id} not found")
    if payload.tools is not None:
        await marketplace_tool_adapter.sync_agent_tools(str(id), payload.tools)
    return BaseResponse.success(data=agent, message="Updated successfully")


@router.put("/{id}", response_model=BaseResponse[AgentRead])
async def put_agent(
    id: uuid.UUID,
    payload: AgentUpdateRequest,
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(get_current_user),
):
    await authorization_service.ensure_agent_ownership(auth, id, operation="update")
    if payload.tools is not None:
        await _validate_requested_tools(payload.tools)
    agent = await AgentService.update_agent(db, id, payload)
    if not agent:
        raise NotFoundException(f"Agent with ID {id} not found")
    if payload.tools is not None:
        await marketplace_tool_adapter.sync_agent_tools(str(id), payload.tools)
    return BaseResponse.success(data=agent, message="Updated successfully")


@router.delete("/{id}", response_model=BaseResponse[AgentRead])
async def delete_agent(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(get_current_user),
):
    await authorization_service.ensure_agent_ownership(auth, id, operation="update")
    agent = await AgentService.delete_agent(db, id)
    if not agent:
        raise NotFoundException(f"Agent with ID {id} not found")
    return BaseResponse.success(data=agent, message="Deleted successfully")

@router.post("/{id}/execute", response_model=BaseResponse[ExecuteAgentResponse])
async def execute_agent(
    id: uuid.UUID,
    request: ExecuteAgentRequest,
    db: AsyncSession = Depends(get_db),
    auth: AuthContext = Depends(get_current_user)
):
    agent = await AgentService.get_agent(db, id)
    if not agent:
        raise NotFoundException(f"Agent with ID {id} not found")
    await authorization_service.ensure_agent_ownership(auth, id, operation="execute")
    team_id = auth.team_id
    
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
    logger.bind(resource_type="execution_record", resource_id=str(id)).info(
        f"execution trace log: start execute agent={id}"
    )
    result = await execution_engine.run(
        agent_id=str(agent.id),
        user_input=request.input,
        auth_context=auth,
        request_id=request_id,
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
