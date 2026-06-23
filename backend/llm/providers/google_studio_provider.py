import asyncio

from google import genai
from google.genai import types

from settings_resolver import resolve_google_studio_api_key

from .base import BaseLLMProvider, LLMProviderError
from ..image_inputs import is_public_http_url, prepare_llm_image_inputs
from ..schemas import LLMGenerateRequest


GOOGLE_STUDIO_MODELS = {
    "gemini-3.5-flash",
    "gemini-3.1-pro-preview",
    "gemini-3.1-flash-lite",
}


class GoogleStudioLLMProvider(BaseLLMProvider):
    def __init__(self, api_key: str | None = None, client=None):
        self.api_key = api_key
        self.client = client

    async def generate(self, request: LLMGenerateRequest) -> str:
        if request.model not in GOOGLE_STUDIO_MODELS:
            raise LLMProviderError(f"Google Studio: unsupported model: {request.model}")

        api_key = self.api_key or resolve_google_studio_api_key()
        if not api_key:
            raise LLMProviderError("Google Studio: API key is missing. Configure GOOGLE_API_KEY, GEMINI_API_KEY, or Settings -> Providers.")

        for item in request.imageInputs or []:
            if is_public_http_url(item.url):
                raise LLMProviderError("Google Studio: remote image URLs are not supported")

        client = self.client or genai.Client(api_key=api_key)
        if self.client is None:
            self.client = client

        config_kwargs = {}
        if request.systemPrompt:
            config_kwargs["system_instruction"] = request.systemPrompt
        if request.temperature is not None:
            config_kwargs["temperature"] = request.temperature
        if request.maxTokens is not None:
            config_kwargs["max_output_tokens"] = request.maxTokens
        generate_content_config = types.GenerateContentConfig(**config_kwargs)

        try:
            prepared_images = await prepare_llm_image_inputs(request.imageInputs, request.projectPath)
        except Exception as exc:
            raise LLMProviderError(f"Google Studio: Failed to prepare image input: {self._safe_message(exc, api_key)}") from exc

        prompt_text = (request.inputText or "").strip()
        if prepared_images:
            prompt_text = (
                "The attached images are ordered as Image 1, Image 2, Image 3, and so on. "
                "When the user refers to image1 or Image 1, use the first image.\n\n"
                f"{prompt_text or 'Please analyze these images.'}"
            )
        else:
            prompt_text = prompt_text or "Please provide a response."

        parts = []
        for image in prepared_images:
            if not image.raw_data:
                raise LLMProviderError(f"Google Studio: Failed to prepare image input at index {image.index}: missing bytes")
            parts.append(
                types.Part.from_bytes(
                    data=image.raw_data,
                    mime_type=image.mime_type or "image/png",
                )
            )
        parts.append(types.Part.from_text(text=prompt_text))

        contents = [
            types.Content(
                role="user",
                parts=parts,
            )
        ]

        try:
            response = await asyncio.to_thread(
                client.models.generate_content,
                model=request.model,
                contents=contents,
                config=generate_content_config,
            )
        except Exception as exc:
            raise LLMProviderError(f"Google Studio: {self._safe_message(exc, api_key)}") from exc

        text = self._extract_text(response)
        if not text:
            raise LLMProviderError("Google Studio: response did not include text output")
        return text

    @staticmethod
    def _extract_text(response) -> str:
        response_text = getattr(response, "text", None)
        if response_text:
            return response_text

        parts = []
        for candidate in getattr(response, "candidates", []) or []:
            content = getattr(candidate, "content", None)
            for part in getattr(content, "parts", []) or []:
                text = getattr(part, "text", None)
                if text:
                    parts.append(text)
        return "".join(parts)

    @staticmethod
    def _safe_message(exc: Exception, api_key: str | None = None) -> str:
        message = str(exc) or exc.__class__.__name__
        if api_key:
            message = message.replace(api_key, "[redacted]")
        return message[:500]
