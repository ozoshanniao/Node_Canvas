from .schemas import ImageGenerationRequest, ImageGenerationResult, ImageInputItem
from .storage import ensure_generation_dir, wrap_image_result
from .providers.google_provider import GoogleImageProvider
from .providers.kie.provider import KieImageProvider


class ImageGenerationService:
    def __init__(self, engines: dict):
        self.engines = engines
        self.google_provider = None
        self.kie_provider = None

    def _legacy_image_inputs(self, image_inputs) -> list[str]:
        if not image_inputs:
            return []

        if all(isinstance(item, str) for item in image_inputs):
            return [item for item in image_inputs if item]

        normalized_items = []
        for fallback_index, item in enumerate(image_inputs):
            if isinstance(item, ImageInputItem):
                normalized_items.append(item)
            elif isinstance(item, dict):
                normalized_items.append(
                    ImageInputItem(
                        index=int(item.get("index", fallback_index)),
                        url=item.get("url"),
                    )
                )
            elif isinstance(item, str):
                normalized_items.append(ImageInputItem(index=fallback_index, url=item))

        return [
            item.url
            for item in sorted(normalized_items, key=lambda image: image.index)
            if item.url
        ]

    async def generate(self, request: ImageGenerationRequest) -> ImageGenerationResult | None:
        generation_dir = request.generation_dir or ensure_generation_dir(request.project_path)
        request.generation_dir = generation_dir

        if request.provider == "Google":
            if self.google_provider is None:
                self.google_provider = GoogleImageProvider()
            result = await self.google_provider.generate(request)
            response_data = wrap_image_result(result)
            return ImageGenerationResult(
                url=response_data.get("url"),
                urls=response_data.get("urls"),
            )

        if str(request.provider).lower() == "kie":
            if self.kie_provider is None:
                self.kie_provider = KieImageProvider()
            result = await self.kie_provider.generate(request)
            response_data = wrap_image_result(result)
            return ImageGenerationResult(
                url=response_data.get("url"),
                urls=response_data.get("urls"),
            )

        active_engine = self.engines.get(request.provider)
        if not active_engine:
            return None

        legacy_image_inputs = self._legacy_image_inputs(request.image_inputs)
        result = await active_engine.generate(
            request.config,
            request.prompt,
            generation_dir,
            legacy_image_inputs,
        )

        if not result:
            return None

        response_data = wrap_image_result(result)
        return ImageGenerationResult(
            url=response_data.get("url"),
            urls=response_data.get("urls"),
        )
