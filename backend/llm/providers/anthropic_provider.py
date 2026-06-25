import re

import httpx

from settings_resolver import resolve_provider_secret

from .base import BaseLLMProvider, LLMProviderError
from ..image_inputs import prepare_llm_image_inputs
from ..schemas import LLMGenerateRequest


ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_VERSION = "2023-06-01"
ANTHROPIC_MODELS = {"claude-opus-4-8", "claude-sonnet-4-6", "claude-haiku-4-5-20251001"}
DATA_URL_RE = re.compile(r"^data:(image/[a-zA-Z0-9.+-]+);base64,(.+)$", re.DOTALL)


def _is_http_url(value: str) -> bool:
    return value.startswith("http://") or value.startswith("https://")


def split_image_data_url(data_url: str) -> tuple[str, str]:
    match = DATA_URL_RE.match(data_url or "")
    if not match:
        raise LLMProviderError("Claude: image input must be a valid image data URL")
    return match.group(1), match.group(2)


class AnthropicLLMProvider(BaseLLMProvider):
    def __init__(self, api_key: str | None = None, client=None):
        self.api_key = api_key
        self.client = client

    def _resolve_api_key(self) -> str:
        api_key = resolve_provider_secret("anthropic", "apiKey", "ANTHROPIC_API_KEY") or self.api_key
        if not api_key:
            raise LLMProviderError(
                "Claude credentials are not configured. Please configure them in Settings -> Providers."
            )
        return api_key

    def _headers(self) -> dict[str, str]:
        api_key = self._resolve_api_key()
        return {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": ANTHROPIC_VERSION,
        }

    async def build_payload(self, request: LLMGenerateRequest) -> dict:
        if request.model not in ANTHROPIC_MODELS:
            raise LLMProviderError(f"Claude: unsupported model: {request.model}")

        for item in request.imageInputs or []:
            url = item.url if hasattr(item, "url") else item.get("url", "")
            if _is_http_url(str(url)):
                raise LLMProviderError("Claude: remote image URLs are not supported for LLM image input")

        try:
            prepared_images = await prepare_llm_image_inputs(request.imageInputs, request.projectPath)
        except Exception as exc:
            raise LLMProviderError(f"Claude: failed to prepare image input: {exc}") from exc

        prompt_text = (request.inputText or "").strip()
        if prepared_images:
            prompt_text = (
                "The attached images are ordered as Image 1, Image 2, Image 3, and so on. "
                "When the user refers to image1 or Image 1, use the first image.\n\n"
                f"{prompt_text or 'Analyze the attached image(s).'}"
            )
        else:
            prompt_text = prompt_text or "Please provide a response."

        content = [{"type": "text", "text": prompt_text}]
        for image in prepared_images:
            media_type, data = split_image_data_url(image.data_url)
            content.append({
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": media_type,
                    "data": data,
                },
            })

        payload = {
            "model": request.model,
            "max_tokens": request.maxTokens if request.maxTokens is not None else 8192,
            "messages": [{"role": "user", "content": content}],
        }
        if request.systemPrompt:
            payload["system"] = request.systemPrompt
        if request.temperature is not None:
            payload["temperature"] = request.temperature
        return payload

    def _parse_text(self, response_json: dict) -> str:
        parts = []
        for block in response_json.get("content", []) or []:
            if block.get("type") == "text" and isinstance(block.get("text"), str):
                parts.append(block["text"])
        if not parts:
            raise LLMProviderError("Claude: response missing text content")
        return "".join(parts)

    def _safe_error(self, response, api_key: str) -> str:
        text = (getattr(response, "text", "") or "")[:500]
        if api_key:
            text = text.replace(api_key, "[redacted]")
        return text or f"HTTP {response.status_code}"

    async def generate(self, request: LLMGenerateRequest) -> str:
        api_key = self._resolve_api_key()
        payload = await self.build_payload(request)
        headers = {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": ANTHROPIC_VERSION,
        }

        if self.client:
            response = await self.client.post(ANTHROPIC_API_URL, headers=headers, json=payload)
        else:
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.post(ANTHROPIC_API_URL, headers=headers, json=payload)

        if response.status_code >= 400:
            raise LLMProviderError(f"Claude: {self._safe_error(response, api_key)}")

        return self._parse_text(response.json())
