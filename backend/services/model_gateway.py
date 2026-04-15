import asyncio
from typing import List
import openai
from openai import AsyncOpenAI
from backend.core.config import settings
from backend.core.logging import logger
from backend.core.rate_limiter import LimitStatus
from backend.models.schemas import Message, ModelConfig, GatewayResponse, TokenUsage, GatewayError
from backend.models.constants import ResponseCode
from backend.services.competition_manager_service import competition_manager_service

class ModelGateway:
    """
    Model Gateway Layer - Handles LLM provider communication with Fail-Fast Quota Control.
    
    CRITICAL CONSTRAINTS:
    1. Quota Enforcement: token_limit & rate_limit MUST come from DB via Competition Manager.
       NO DEFAULT_TOKEN_LIMIT, DEFAULT_RATE_LIMIT, OR HARDCODED QUOTAS ALLOWED.
    2. Fail-Fast: Immediately return 429 on quota/rate limit exceeded. 
       NO SLEEP, NO QUEUING, NO FALLBACK.
    3. Limited Retry: ONLY retry on Timeout or Transport Error.
    4. Fine-grained Rate Limit: This layer controls per-team model call frequency.
    """
    def __init__(self, api_key: str, base_url: str):
        self.client = AsyncOpenAI(api_key=api_key, base_url=base_url)
        self.default_timeout = 30.0  # Phase D2: Increased timeout to 30s
        self.max_retries = 2 # 1 initial + 1 retry

    async def chat(
        self, 
        messages: List[Message], 
        config: ModelConfig, 
        team_id: str
    ) -> GatewayResponse:
        """
        Unified entry point for LLM calls with quota, rate limiting, and limited retry.
        """
        # 1. Rate Limit & Quota Check (Fail-Fast, No Retry)
        try:
            # Check QPS Rate Limit
            rate_status = await competition_manager_service.check_team_rate_limit(team_id)
            if rate_status == LimitStatus.EXCEEDED:
                return GatewayResponse(
                    content="",
                    token_usage=TokenUsage(),
                    error=GatewayError(
                        code=ResponseCode.RATE_LIMIT_EXCEEDED,
                        message="Rate limit exceeded. Please wait and try again."
                    )
                )
            elif rate_status == LimitStatus.INFRA_ERROR:
                return GatewayResponse(
                    content="",
                    token_usage=TokenUsage(),
                    error=GatewayError(
                        code=ResponseCode.INTERNAL_ERROR,
                        message="Internal service error during rate limit validation."
                    )
                )

            # Check Token Quota
            token_status = await competition_manager_service.check_team_token_limit(team_id)
            if token_status == LimitStatus.EXCEEDED:
                return GatewayResponse(
                    content="",
                    token_usage=TokenUsage(),
                    error=GatewayError(
                        code=ResponseCode.QUOTA_EXCEEDED,
                        message="Token quota exhausted for this team."
                    )
                )
            elif token_status == LimitStatus.INFRA_ERROR:
                return GatewayResponse(
                    content="",
                    token_usage=TokenUsage(),
                    error=GatewayError(
                        code=ResponseCode.INTERNAL_ERROR,
                        message="Internal service error during quota validation."
                    )
                )
        except Exception as e:
            # Mask unexpected failures for security
            logger.error(f"Unexpected quota/rate check failure: {str(e)}")
            return GatewayResponse(
                content="",
                token_usage=TokenUsage(),
                error=GatewayError(
                    code=ResponseCode.INTERNAL_ERROR,
                    message="An unexpected error occurred during validation."
                )
            )

        # 2. LLM Call with Limited Retry
        openai_messages = [{"role": m.role, "content": m.content} for m in messages]
        
        for attempt in range(self.max_retries):
            try:
                logger.info(f"Initiating LLM call for team {team_id} with model {config.model} (Attempt {attempt + 1}/{self.max_retries})")
                
                response = await asyncio.wait_for(
                    self.client.chat.completions.create(
                        model=config.model,
                        messages=openai_messages,
                        temperature=config.temperature,
                        max_tokens=config.max_tokens,
                    ),
                    timeout=self.default_timeout
                )
                
                # Extract content and usage
                content = response.choices[0].message.content or ""
                usage = response.usage
                if usage is None:
                    return GatewayResponse(
                        content="",
                        token_usage=TokenUsage(),
                        error=GatewayError(
                            code=ResponseCode.MODEL_ERROR,
                            message="Model response missing token usage."
                        )
                    )
                token_usage = TokenUsage(
                    prompt_tokens=usage.prompt_tokens,
                    completion_tokens=usage.completion_tokens,
                    total_tokens=usage.total_tokens
                )
                if token_usage.total_tokens < 0:
                    return GatewayResponse(
                        content="",
                        token_usage=TokenUsage(),
                        error=GatewayError(
                            code=ResponseCode.MODEL_ERROR,
                            message="Model returned invalid token usage."
                        )
                    )
                
                await competition_manager_service.consume_team_quota(team_id, token_usage.total_tokens)
                logger.info(f"LLM call successful for team {team_id} on attempt {attempt + 1}. Tokens: {token_usage.total_tokens}")
                
                return GatewayResponse(
                    content=content,
                    token_usage=token_usage
                )

            except asyncio.TimeoutError:
                logger.warning(f"LLM call timed out for team {team_id} on attempt {attempt + 1} after {self.default_timeout}s")
                if attempt == self.max_retries - 1:
                    logger.error(f"LLM call failed permanently due to timeout for team {team_id}")
                    return GatewayResponse(
                        content="",
                        token_usage=TokenUsage(),
                        error=GatewayError(
                            code=ResponseCode.MODEL_TIMEOUT,
                            message=f"Model call timed out after {self.default_timeout}s."
                        )
                    )
                await asyncio.sleep(0.5)
            
            except openai.APIConnectionError as e:
                logger.warning(f"LLM transport error for team {team_id} on attempt {attempt + 1}: {str(e)}")
                if attempt == self.max_retries - 1:
                    logger.error(f"LLM call failed permanently due to transport error for team {team_id}")
                    return GatewayResponse(
                        content="",
                        token_usage=TokenUsage(),
                        error=GatewayError(
                            code=ResponseCode.MODEL_ERROR,
                            message="Model service connection failed."
                        )
                    )
                await asyncio.sleep(0.5)
                
            except Exception as e:
                # Business errors (Auth, RateLimit from Provider, Invalid Request) -> Fail Fast
                logger.error(f"LLM provider business error for team {team_id}: {str(e)}")
                return GatewayResponse(
                    content="",
                    token_usage=TokenUsage(),
                    error=GatewayError(
                        code=ResponseCode.MODEL_ERROR,
                        message="Model service is currently unavailable or returned an error."
                    )
                )

# Singleton instance
model_gateway = ModelGateway(
    api_key=settings.MODEL_API_KEY,
    base_url=settings.MODEL_BASE_URL
)
