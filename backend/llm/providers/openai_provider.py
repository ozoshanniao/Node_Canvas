import httpx

from provider_base_url import ProviderBaseUrlError, normalize_provider_base_url
from settings_resolver import resolve_provider_secret, resolve_provider_setting

from .base import BaseLLMProvider, LLMProviderError
from ..image_inputs import prepare_llm_image_inputs
from ..schemas import LLMGenerateRequest


OPENAI_DEFAULT_BASE_URL = "https://api.openai.com/v1"
OPENAI_MODELS = {"gpt-5.5", "gpt-5.4-mini", "gpt-5.4-nano"}


def _is_http_url(value: str) -> bool:
    return value.startswith("http://") or value.startswith("https://")


class OpenAILLMProvider(BaseLLMProvider):
    def __init__(self, api_key: str | None = None, base_url: str | None = None, client=None):
        self.api_key = api_key
        self.base_url = base_url
        self.client = client

    def _resolve_api_key(self) -> str:
        api_key = resolve_provider_secret("openai", "apiKey", "OPENAI_API_KEY") or self.api_key
        if not api_key:
            raise LLMProviderError(
                "OpenAI credentials are not configured. Please configure them in Settings -> Providers."
            )
        return api_key

    def _resolve_base_url(self) -> str:
        value = self.base_url or resolve_provider_setting(
            "openai",
            "baseUrl",
            "OPENAI_BASE_URL",
            OPENAI_DEFAULT_BASE_URL,
        )
        try:
            return normalize_provider_base_url(value or "", default=OPENAI_DEFAULT_BASE_URL)
        except ProviderBaseUrlError as exc:
            raise LLMProviderError(f"OpenAI: {exc}") from exc

    def _headers(self) -> dict[str, str]:
        api_key = self._resolve_api_key()
        return {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        }

    async def build_payload(self, request: LLMGenerateRequest) -> dict:
        if request.model not in OPENAI_MODELS:
            raise LLMProviderError(f"OpenAI: unsupported model: {request.model}")

        for item in request.imageInputs or []:
            url = item.url if hasattr(item, "url") else item.get("url", "")
            if _is_http_url(str(url)):
                raise LLMProviderError("OpenAI: remote image URLs are not supported for LLM image input")

        try:
            prepared_images = await prepare_llm_image_inputs(request.imageInputs, request.projectPath)
        except Exception as exc:
            raise LLMProviderError(f"OpenAI: failed to prepare image input: {exc}") from exc

        prompt_text = (request.inputText or "").strip()
        if prepared_images:
            prompt_text = (
                "The attached images are ordered as Image 1, Image 2, Image 3, and so on. "
                "When the user refers to image1 or Image 1, use the first image.\n\n"
                f"{prompt_text or 'Analyze the attached image(s).'}"
            )
        else:
            prompt_text = prompt_text or "Please provide a response."

        content = [{"type": "input_text", "text": prompt_text}]
        for image in prepared_images:
            content.append({"type": "input_image", "image_url": image.data_url})

        payload = {
            "model": request.model,
            "input": [{"role": "user", "content": content}],
        }
        if request.systemPrompt:
            payload["instructions"] = request.systemPrompt
        if request.temperature is not None:
            payload["temperature"] = request.temperature
        if request.maxTokens is not None:
            payload["max_output_tokens"] = request.maxTokens
        return payload

    def _parse_text(self, response_json: dict) -> str:
        text = response_json.get("output_text")
        if isinstance(text, str):
            return text

        parts = []
        for output in response_json.get("output", []) or []:
            for content in output.get("content", []) or []:
                if content.get("type") in {"output_text", "text"} and isinstance(content.get("text"), str):
                    parts.append(content["text"])
        if parts:
            return "".join(parts)
        raise LLMProviderError("OpenAI: response missing output text")

    def _safe_error(self, response, api_key: str) -> str:
        text = (getattr(response, "text", "") or "")[:500]
        if api_key:
            text = text.replace(api_key, "[redacted]")
        return text or f"HTTP {response.status_code}"

    async def generate(self, request: LLMGenerateRequest) -> str:
        api_key = self._resolve_api_key()
        base_url = self._resolve_base_url()
        payload = await self.build_payload(request)
        api_url = f"{base_url}/responses"
        headers = {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        }

        if self.client:
            response = await self.client.post(api_url, headers=headers, json=payload)
        else:
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.post(api_url, headers=headers, json=payload)

        if response.status_code >= 400:
            raise LLMProviderError(f"OpenAI: {self._safe_error(response, api_key)}")

        return self._parse_text(response.json())
