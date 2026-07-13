from settings_resolver import resolve_provider_secret

from .base import BaseImageProvider
from ..adapters.google_gemini_image_adapter import GoogleGeminiImageAdapter


class GoogleImageProvider(BaseImageProvider):
    MODEL_MAP = {
        "Nano 2": "gemini-3.1-flash-image",
        "Nano Banana 2": "gemini-3.1-flash-image",
        "gemini-3.1-flash-image": "gemini-3.1-flash-image",
        "Nano Pro": "gemini-3-pro-image",
        "Nano pro": "gemini-3-pro-image",
        "Nano Banana Pro": "gemini-3-pro-image",
        "gemini-3-pro-image": "gemini-3-pro-image",
    }
    SUPPORTED_MODELS = {"gemini-3.1-flash-image", "gemini-3-pro-image"}

    def __init__(self, api_key: str | None = None):
        self.api_key = api_key
        self.adapter = None
        self._adapter_api_key = None

    def _adapter(self):
        api_key = self.api_key or resolve_provider_secret("google", "apiKey", "GOOGLE_CLOUD_API_KEY")
        if not api_key:
            raise ValueError("GOOGLE_CLOUD_API_KEY is missing")
        if self.adapter is not None and self._adapter_api_key is None:
            return self.adapter
        if self.adapter is None or self._adapter_api_key != api_key:
            self.adapter = GoogleGeminiImageAdapter(api_key=api_key)
            self._adapter_api_key = api_key
        return self.adapter

    def _normalize_model(self, model):
        return self.MODEL_MAP.get(model, model)

    async def generate(self, request):
        target_model = self._normalize_model(request.model or request.config.get("model"))
        if target_model not in self.SUPPORTED_MODELS:
            raise ValueError(f"Google image model is not supported: {request.model}")
        return await self._adapter().generate(request, target_model)

