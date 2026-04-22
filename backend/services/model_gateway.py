import json
from typing import Any, Dict, List, Optional
import openai
from openai import AsyncOpenAI
from backend.core.exceptions import ModelGatewayException
from backend.core.logging import logger
from backend.core.security import validate_provider_url
from backend.models.constants import ArcErrorCode, ResponseCode
from backend.models.schemas import GatewayResponse, GatewayToolCall, Message, ModelConfig, TokenUsage

class ModelGateway:
    """
    Stateless model gateway.
    Each request builds a fresh OpenAI-compatible client from Agent configuration.
    """

    @staticmethod
    def _estimate_usage(messages: List[Message], content: str) -> TokenUsage:
        prompt_chars = sum(len((m.content or "")) for m in messages)
        completion_chars = len(content)
        prompt_tokens = max(1, prompt_chars // 4) if prompt_chars > 0 else 0
        completion_tokens = max(1, completion_chars // 4) if completion_chars > 0 else 0
        return TokenUsage(
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=prompt_tokens + completion_tokens,
            usage_estimated=True,
        )

    @staticmethod
    def _raise_gateway_error(arc_code: ArcErrorCode, message: str, status_code: int = 502) -> None:
        raise ModelGatewayException(
            message=message,
            code=ResponseCode.MODEL_ERROR,
            data={"error": {"code": arc_code.value, "message": message}},
        )

    async def chat(
        self,
        messages: List[Message],
        config: ModelConfig,
        provider_url: str,
        api_key: str,
        tools: Optional[List[Dict[str, Any]]] = None,
    ) -> GatewayResponse:
        validate_provider_url(provider_url)
        if not api_key.strip():
            self._raise_gateway_error(ArcErrorCode.MISSING_API_KEY, "Agent API key is missing", status_code=422)

        client = AsyncOpenAI(api_key=api_key, base_url=provider_url, timeout=30.0, max_retries=0)
        model_name = config.model.strip()
        if not model_name:
            self._raise_gateway_error(ArcErrorCode.MODEL_NOT_FOUND, "Agent model name is missing", status_code=422)

        openai_messages: List[Dict[str, Any]] = []
        for m in messages:
            payload: Dict[str, Any] = {"role": m.role}
            if m.content is not None:
                payload["content"] = m.content
            if m.name:
                payload["name"] = m.name
            if m.tool_call_id:
                payload["tool_call_id"] = m.tool_call_id
            openai_messages.append(payload)

        request_kwargs: Dict[str, Any] = {
            "model": model_name,
            "messages": openai_messages,
            "temperature": config.temperature,
            "max_tokens": config.max_tokens,
        }
        if tools:
            request_kwargs["tools"] = tools
            request_kwargs["tool_choice"] = "auto"

        try:
            response = await client.chat.completions.create(**request_kwargs)
            choice = response.choices[0]
            message = choice.message
            finish_reason = choice.finish_reason

            tool_call = None
            if getattr(message, "tool_calls", None):
                first_call = message.tool_calls[0]
                try:
                    json.loads(first_call.function.arguments or "{}")
                except Exception:
                    self._raise_gateway_error(
                        ArcErrorCode.INVALID_TOOL_CALL,
                        "Model returned invalid tool call arguments",
                    )
                tool_call = GatewayToolCall(
                    id=first_call.id,
                    function_name=first_call.function.name,
                    function_arguments=first_call.function.arguments or "{}",
                )

            content = message.content or ""
            usage = response.usage
            if usage is None:
                token_usage = self._estimate_usage(messages, content)
            else:
                token_usage = TokenUsage(
                    prompt_tokens=usage.prompt_tokens or 0,
                    completion_tokens=usage.completion_tokens or 0,
                    total_tokens=usage.total_tokens or 0,
                    usage_estimated=False,
                )

            return GatewayResponse(
                content=content,
                token_usage=token_usage,
                finish_reason=finish_reason,
                tool_call=tool_call,
            )
        except openai.AuthenticationError as exc:
            logger.warning(f"Gateway auth failure: {str(exc)}")
            self._raise_gateway_error(ArcErrorCode.AUTH_FAILED, "Provider authentication failed", status_code=401)
        except openai.NotFoundError as exc:
            logger.warning(f"Gateway model not found: {str(exc)}")
            self._raise_gateway_error(ArcErrorCode.MODEL_NOT_FOUND, "Model not found", status_code=404)
        except openai.RateLimitError as exc:
            logger.warning(f"Gateway rate limited: {str(exc)}")
            self._raise_gateway_error(ArcErrorCode.PROVIDER_RATE_LIMITED, "Provider rate limited", status_code=429)
        except (openai.APIConnectionError, openai.APITimeoutError) as exc:
            logger.warning(f"Gateway network error: {str(exc)}")
            self._raise_gateway_error(ArcErrorCode.NETWORK_ERROR, "Network error")
        except openai.BadRequestError as exc:
            message = str(exc)
            if "tool" in message.lower() and "support" in message.lower():
                self._raise_gateway_error(
                    ArcErrorCode.MODEL_CAPABILITY_MISMATCH,
                    "Model does not support tool calling for this request",
                    status_code=422,
                )
            self._raise_gateway_error(ArcErrorCode.INVALID_TOOL_CALL, "Invalid tool call request", status_code=422)
        except ModelGatewayException:
            raise
        except Exception as exc:
            logger.error(f"Gateway unexpected error: {str(exc)}")
            self._raise_gateway_error(ArcErrorCode.NETWORK_ERROR, "Network error")

    async def call(
        self,
        messages: List[Message],
        tools: List[Dict[str, Any]],
        config: ModelConfig,
        provider_url: str,
        api_key: str,
    ) -> GatewayResponse:
        return await self.chat(
            messages=messages,
            config=config,
            provider_url=provider_url,
            api_key=api_key,
            tools=tools,
        )

# Singleton instance
model_gateway = ModelGateway()
