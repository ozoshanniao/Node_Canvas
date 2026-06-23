from settings_resolver import resolve_google_studio_api_key

from .base import BaseImageProvider
from ..adapters.google_studio_native_image_adapter import GoogleStudioNativeImageAdapter


class GoogleStudioImageProvider(BaseImageProvider):
    MODEL_MAP = {
        "Nano Banana Pro": "gemini-3-pro-image",
        "gemini-3-pro-image": "gemini-3-pro-image",
        "Nano Banana 2": "gemini-3.1-flash-image",
        "gemini-3.1-flash-image": "gemini-3.1-flash-image",
    }
    SUPPORTED_MODELS = {"gemini-3-pro-image", "gemini-3.1-flash-image"}

    def __init__(self, api_key: str | None = None, client=None):
        self.api_key = api_key or resolve_google_studio_api_key()
        if not self.api_key:
            raise ValueError("Google Studio: API key is missing. Configure GOOGLE_API_KEY, GEMINI_API_KEY, or Settings -> Providers.")
        self.adapter = GoogleStudioNativeImageAdapter(api_key=self.api_key, client=client)

    def _normalize_model(self, model):
        return self.MODEL_MAP.get(model, model)

    async def generate(self, request):
        target_model = self._normalize_model(request.model or request.config.get("model"))
        if target_model not in self.SUPPORTED_MODELS:
            raise ValueError(f"Google Studio: unsupported image model: {request.model}")
        return await self.adapter.generate(request, target_model)
