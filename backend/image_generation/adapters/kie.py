from __future__ import annotations

from typing import Any

from media.provider_asset_uploader import ProviderAssetUploadRouter

from image_generation.providers.kie.payloads import build_kie_image_create_payload, default_kie_image_task_type
from image_generation.providers.kie.result_parser import (
    extract_kie_image_error_message,
    extract_kie_image_task_id,
    extract_kie_image_url,
    normalize_kie_image_status,
)
from image_generation.schemas import ImageGenerationRequest, ImageInputItem


class KieImageAdapter:
    provider = "kie"
    adapter_id = "kie:image"

    def __init__(
        self,
        *,
        client: Any | None = None,
        asset_router: ProviderAssetUploadRouter | None = None,
    ):
        if client is None:
            from video_generation.providers.kie.client import KieClient

            client = KieClient()
        self.client = client
        self.asset_router = asset_router or ProviderAssetUploadRouter()

    def supports(self, capability: dict[str, Any]) -> bool:
        return capability.get("provider") == self.provider and capability.get("mediaType") == "image"

    def _ordered_image_inputs(self, image_inputs) -> list[str]:
        ordered_items = []
        for fallback_index, item in enumerate(image_inputs or []):
            if isinstance(item, ImageInputItem):
                ordered_items.append(item)
            elif isinstance(item, dict):
                ordered_items.append(
                    ImageInputItem(
                        index=int(item.get("index", fallback_index)),
                        url=item.get("url"),
                    )
                )
            elif isinstance(item, str):
                ordered_items.append(ImageInputItem(index=fallback_index, url=item))
        return [item.url for item in sorted(ordered_items, key=lambda image: image.index) if item.url]

    async def _resolve_image_urls(self, request: ImageGenerationRequest) -> list[str]:
        image_urls = []
        for image_ref in self._ordered_image_inputs(request.image_inputs):
            resolved = await self.asset_router.resolve(
                provider="kie",
                asset=image_ref,
                purpose="image:in",
                project_path=request.project_path,
            )
            url = resolved.url or resolved.data_uri
            if not url:
                raise ValueError("KIE image asset routing did not return a URL")
            image_urls.append(url)
        return image_urls

    async def build_create_payload(self, request: ImageGenerationRequest) -> dict[str, Any]:
        image_urls = await self._resolve_image_urls(request)
        task_type = default_kie_image_task_type(request.model or request.config.get("model"), bool(image_urls))
        return build_kie_image_create_payload(
            model=request.model or request.config.get("model"),
            prompt=request.prompt,
            task_type=task_type,
            params=request.config,
            image_urls=image_urls,
        )

    async def create(self, request: ImageGenerationRequest) -> dict[str, Any]:
        payload = await self.build_create_payload(request)
        response = await self.client.create_task(payload)
        task_id = extract_kie_image_task_id(response)
        data = response.get("data") if isinstance(response.get("data"), dict) else response
        raw_status = str(data.get("state") or data.get("status") or "waiting")
        return {
            "provider": self.provider,
            "model": request.model or request.config.get("model"),
            "task_id": task_id,
            "status": normalize_kie_image_status(raw_status),
            "raw_status": raw_status,
            "raw_response": response,
        }

    async def query(self, task_id: str, *, model: str | None = None) -> dict[str, Any]:
        response = await self.client.get_task(task_id)
        data = response.get("data") if isinstance(response.get("data"), dict) else response
        raw_status = str(data.get("state") or data.get("status") or "")
        status = normalize_kie_image_status(raw_status)
        image_url = extract_kie_image_url(response) if status == "succeeded" else None
        message = extract_kie_image_error_message(response) if status == "failed" else str(response.get("msg") or response.get("message") or raw_status or "")
        return {
            "provider": self.provider,
            "model": model,
            "task_id": task_id,
            "status": status,
            "raw_status": raw_status or None,
            "image_url": image_url,
            "message": message or None,
            "raw_response": response,
        }
