import os

from .base import BaseImageProvider
from ..adapters.google_gemini_image_adapter import GoogleGeminiImageAdapter


class GoogleImageProvider(BaseImageProvider):
    MODEL_MAP = {
        "Nano 2": "gemini-3.1-flash-image-preview",
        "Nano Banana 2": "gemini-3.1-flash-image-preview",
        "gemini-3.1-flash-image-preview": "gemini-3.1-flash-image-preview",
        "Nano Pro": "gemini-3-pro-image-preview",
        "Nano pro": "gemini-3-pro-image-preview",
        "Nano Banana Pro": "gemini-3-pro-image-preview",
        "gemini-3-pro-image-preview": "gemini-3-pro-image-preview",
    }
    SUPPORTED_MODELS = {"gemini-3.1-flash-image-preview", "gemini-3-pro-image-preview"}

    def __init__(self, api_key: str | None = None):
        self.api_key = api_key or os.getenv("GOOGLE_CLOUD_API_KEY")
        if not self.api_key:
            raise ValueError("GOOGLE_CLOUD_API_KEY is missing")
        self.adapter = GoogleGeminiImageAdapter(api_key=self.api_key)

    def _normalize_model(self, model):
        return self.MODEL_MAP.get(model, model)

    async def generate(self, request):
        target_model = self._normalize_model(request.model or request.config.get("model"))
        if target_model not in self.SUPPORTED_MODELS:
            raise ValueError(f"Google image model is not supported: {request.model}")
        return await self.adapter.generate(request, target_model)

