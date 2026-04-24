import json
import re
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
    def _raise_gateway_error(
        arc_code: ArcErrorCode,
        message: str,
        status_code: int = 502,
        details: Optional[Dict[str, Any]] = None,
    ) -> None:
        raise ModelGatewayException(
            message=message,
            code=ResponseCode.MODEL_ERROR,
            data={
                "error": {
                    "code": arc_code.value,
                    "message": message,
                    "details": details,
                }
            },
        )

    @staticmethod
    def _extract_tool_names(tools: Optional[List[Dict[str, Any]]]) -> List[str]:
        if not tools:
            return []
        tool_names = [
            str(((tool.get("function") or {}).get("name", ""))).strip()
            for tool in tools
            if isinstance(tool, dict)
        ]
        return [name for name in tool_names if name]

    @staticmethod
    def _sanitize_tool_choice(tool_choice: Optional[Dict[str, Any] | str]) -> Optional[Dict[str, Any] | str]:
        if tool_choice is None:
            return None
        if isinstance(tool_choice, (dict, str)):
            return tool_choice
        return str(tool_choice)

    @staticmethod
    def to_provider_tool_name(tool_id: str) -> str:
        normalized = re.sub(r"[^A-Za-z0-9_]+", "_", (tool_id or "").strip())
        normalized = re.sub(r"_+", "_", normalized).strip("_")
        return normalized or "tool"

    @staticmethod
    def _build_tool_name_maps(
        tools: Optional[List[Dict[str, Any]]],
    ) -> tuple[List[Dict[str, Any]], Dict[str, str], Dict[str, str]]:
        if not tools:
            return [], {}, {}

        mapped_tools: List[Dict[str, Any]] = []
        internal_to_provider: Dict[str, str] = {}
        provider_to_internal: Dict[str, str] = {}
        provider_name_counts: Dict[str, int] = {}

        for raw_tool in tools:
            if not isinstance(raw_tool, dict):
                continue
            function_payload = raw_tool.get("function") or {}
            internal_tool_id = str(function_payload.get("name", "")).strip()
            if not internal_tool_id:
                mapped_tools.append(raw_tool)
                continue

            base_provider_name = ModelGateway.to_provider_tool_name(internal_tool_id)
            count = provider_name_counts.get(base_provider_name, 0) + 1
            provider_name_counts[base_provider_name] = count
            provider_tool_name = base_provider_name if count == 1 else f"{base_provider_name}_{count}"

            mapped_tool = dict(raw_tool)
            mapped_function_payload = dict(function_payload)
            mapped_function_payload["name"] = provider_tool_name
            mapped_tool["function"] = mapped_function_payload
            mapped_tools.append(mapped_tool)

            internal_to_provider[internal_tool_id] = provider_tool_name
            provider_to_internal[provider_tool_name] = internal_tool_id

        return mapped_tools, internal_to_provider, provider_to_internal

    @staticmethod
    def _map_tool_choice_for_provider(
        tool_choice: Optional[Dict[str, Any] | str],
        internal_to_provider: Dict[str, str],
    ) -> Optional[Dict[str, Any] | str]:
        sanitized = ModelGateway._sanitize_tool_choice(tool_choice)
        if not isinstance(sanitized, dict):
            return sanitized
        function_payload = sanitized.get("function")
        if not isinstance(function_payload, dict):
            return sanitized
        internal_name = str(function_payload.get("name", "")).strip()
        if not internal_name:
            return sanitized
        provider_name = internal_to_provider.get(internal_name)
        if not provider_name:
            return sanitized
        mapped = dict(sanitized)
        mapped_function = dict(function_payload)
        mapped_function["name"] = provider_name
        mapped["function"] = mapped_function
        return mapped

    @staticmethod
    def _extract_provider_message(exc: Exception) -> str:
        body = getattr(exc, "body", None)
        if isinstance(body, dict):
            error_payload = body.get("error")
            if isinstance(error_payload, dict):
                message = error_payload.get("message")
                if isinstance(message, str) and message.strip():
                    return message.strip()
            message = body.get("message")
            if isinstance(message, str) and message.strip():
                return message.strip()
        return str(exc)

    async def chat(
        self,
        messages: List[Message],
        config: ModelConfig,
        provider_url: str,
        api_key: str,
        tools: Optional[List[Dict[str, Any]]] = None,
        tool_choice: Optional[Dict[str, Any] | str] = None,
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
            if m.tool_calls:
                payload["tool_calls"] = [
                    {
                        "id": tool_call.id,
                        "type": "function",
                        "function": {
                            "name": tool_call.function_name,
                            "arguments": tool_call.function_arguments,
                        },
                    }
                    for tool_call in m.tool_calls
                ]
            openai_messages.append(payload)

        request_kwargs: Dict[str, Any] = {
            "model": model_name,
            "messages": openai_messages,
            "temperature": config.temperature,
            "max_tokens": config.max_tokens,
        }
        internal_tool_names = self._extract_tool_names(tools)
        mapped_tools, internal_to_provider_tool_name, provider_to_internal_tool_name = self._build_tool_name_maps(tools)
        provider_tool_names = list(provider_to_internal_tool_name.keys())
        mapped_tool_choice = self._map_tool_choice_for_provider(tool_choice, internal_to_provider_tool_name)

        if tools:
            request_kwargs["tools"] = mapped_tools
            request_kwargs["tool_choice"] = mapped_tool_choice or "auto"

        logger.bind(
            event="gateway_before_provider_call",
            internal_tool_ids=internal_tool_names,
            provider_tool_names=provider_tool_names,
        ).info("Sending tools to provider")

        try:
            response = await client.chat.completions.create(**request_kwargs)
            choice = response.choices[0]
            message = choice.message
            finish_reason = choice.finish_reason
            raw_returned_function_names = [
                raw_tool_call.function.name
                for raw_tool_call in getattr(message, "tool_calls", []) or []
                if getattr(raw_tool_call, "function", None) is not None
            ]
            logger.bind(
                event="gateway_after_provider_call",
                raw_returned_function_names=raw_returned_function_names,
            ).info("Provider returned model response")

            tool_calls: List[GatewayToolCall] = []
            if getattr(message, "tool_calls", None):
                for raw_tool_call in message.tool_calls:
                    try:
                        json.loads(raw_tool_call.function.arguments or "{}")
                    except Exception:
                        self._raise_gateway_error(
                            ArcErrorCode.INVALID_TOOL_CALL,
                            "Model returned invalid tool call arguments",
                        )
                    tool_calls.append(
                        GatewayToolCall(
                            id=raw_tool_call.id,
                            function_name=raw_tool_call.function.name,
                            function_arguments=raw_tool_call.function.arguments or "{}",
                        )
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
                tool_calls=tool_calls,
                tool_call=tool_calls[0] if tool_calls else None,
                provider_tool_name_to_internal_id=provider_to_internal_tool_name,
                internal_tool_id_to_provider_name=internal_to_provider_tool_name,
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
            error_details = {
                "provider_status": getattr(exc, "status_code", 400),
                "provider_message": self._extract_provider_message(exc),
                "tool_names": provider_tool_names,
                "internal_tool_names": internal_tool_names,
                "tool_choice": self._sanitize_tool_choice(mapped_tool_choice or ("auto" if tools else None)),
            }
            if "tool" in message.lower() and "support" in message.lower():
                self._raise_gateway_error(
                    ArcErrorCode.MODEL_CAPABILITY_MISMATCH,
                    "Model does not support tool calling for this request",
                    status_code=422,
                    details=error_details,
                )
            self._raise_gateway_error(
                ArcErrorCode.INVALID_TOOL_CALL,
                "Invalid tool call request",
                status_code=422,
                details=error_details,
            )
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
        tool_choice: Optional[Dict[str, Any] | str] = None,
    ) -> GatewayResponse:
        return await self.chat(
            messages=messages,
            config=config,
            provider_url=provider_url,
            api_key=api_key,
            tools=tools,
            tool_choice=tool_choice,
        )

# Singleton instance
model_gateway = ModelGateway()
