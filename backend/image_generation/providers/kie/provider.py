from __future__ import annotations

from image_generation.adapters.kie import KieImageAdapter
from image_generation.providers.base import BaseImageProvider


class KieImageProvider(BaseImageProvider):
    def __init__(self, adapter: KieImageAdapter | None = None):
        self.adapter = adapter or KieImageAdapter()

    async def generate(self, request):
        create_result = await self.adapter.create(request)
        query_result = await self.adapter.query(create_result["task_id"], model=create_result.get("model"))
        if query_result["status"] == "succeeded" and query_result.get("image_url"):
            return query_result["image_url"]
        if query_result["status"] == "failed":
            raise RuntimeError(query_result.get("message") or "KIE image generation failed")
        raise RuntimeError("KIE image task has not completed yet; polling/persistence is deferred to a later phase")
