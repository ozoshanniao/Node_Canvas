import os

import httpx

from .base import BaseLLMProvider, LLMProviderError
from ..schemas import LLMGenerateRequest


DEEPSEEK_MODELS = {"deepseek-v4-flash", "deepseek-v4-pro"}


class DeepSeekLLMProvider(BaseLLMProvider):
    def __init__(
        self,
        api_key: str | None = None,
        base_url: str | None = None,
        client=None,
    ):
        self.api_key = api_key if api_key is not None else os.getenv("DEEPSEEK_API_KEY")
        self.base_url = (base_url or os.getenv("DEEPSEEK_BASE_URL") or "https://api.deepseek.com").rstrip("/")
        self.client = client

    def _headers(self) -> dict[str, str]:
        if not self.api_key:
            raise LLMProviderError("DEEPSEEK_API_KEY is not configured")
        return {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        }

    def _thinking_type(self, request: LLMGenerateRequest) -> str:
        value = str(request.thinking or request.thinkingLevel or "enabled").lower()
        return "disabled" if value == "disabled" else "enabled"

    def _reasoning_effort(self, request: LLMGenerateRequest, thinking_type: str) -> str | None:
        if thinking_type == "disabled":
            return None
        value = str(request.reasoningEffort or "high").lower()
        return "max" if value == "max" else "high"

    def build_payload(self, request: LLMGenerateRequest) -> dict:
        if request.model not in DEEPSEEK_MODELS:
            raise LLMProviderError(f"Unsupported DeepSeek model: {request.model}")
        if request.imageInputs:
            raise LLMProviderError(
                "Current DeepSeek model does not support image input. Remove image connections or switch to a vision-capable model."
            )

        thinking_type = self._thinking_type(request)
        payload = {
            "model": request.model,
            "messages": [
                {
                    "role": "user",
                    "content": (request.inputText or "").strip() or "Please provide a response.",
                }
            ],
            "thinking": {"type": thinking_type},
            "stream": False,
        }
        reasoning_effort = self._reasoning_effort(request, thinking_type)
        if reasoning_effort:
            payload["reasoning_effort"] = reasoning_effort
        if request.maxTokens is not None:
            payload["max_tokens"] = request.maxTokens
        return payload

    def _parse_text(self, response_json: dict) -> str:
        try:
            content = response_json["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise LLMProviderError("DeepSeek response missing choices[0].message.content") from exc
        if content is None:
            raise LLMProviderError("DeepSeek response missing choices[0].message.content")
        return str(content)

    def _log_usage(self, response_json: dict) -> None:
        usage = response_json.get("usage")
        if not isinstance(usage, dict):
            return
        completion_details = usage.get("completion_tokens_details")
        print(
            "[DeepSeek LLM usage]",
            {
                "prompt_tokens": usage.get("prompt_tokens"),
                "completion_tokens": usage.get("completion_tokens"),
                "total_tokens": usage.get("total_tokens"),
                "prompt_cache_hit_tokens": usage.get("prompt_cache_hit_tokens"),
                "prompt_cache_miss_tokens": usage.get("prompt_cache_miss_tokens"),
                "reasoning_tokens": completion_details.get("reasoning_tokens")
                if isinstance(completion_details, dict)
                else None,
            },
        )

    async def generate(self, request: LLMGenerateRequest) -> str:
        payload = self.build_payload(request)
        api_url = f"{self.base_url}/chat/completions"
        headers = self._headers()

        print(
            "[DeepSeek LLM request]",
            {
                "url": api_url,
                "model": payload.get("model"),
                "stream": payload.get("stream"),
                "thinking": payload.get("thinking"),
                "reasoning_effort": payload.get("reasoning_effort"),
                "max_tokens": payload.get("max_tokens"),
                "inputTextLength": len(payload["messages"][0]["content"]),
            },
        )

        if self.client:
            response = await self.client.post(api_url, headers=headers, json=payload)
        else:
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.post(api_url, headers=headers, json=payload)

        if response.status_code >= 400:
            error_text = response.text or ""
            raise LLMProviderError(
                "DeepSeek API error | "
                f"model={request.model} | "
                f"status={response.status_code} | "
                f"response={error_text[:500]}"
            )

        response_json = response.json()
        self._log_usage(response_json)
        return self._parse_text(response_json)
