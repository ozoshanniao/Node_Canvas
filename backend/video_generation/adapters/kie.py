from __future__ import annotations

from typing import Any, Mapping

from media.provider_asset_uploader import ProviderAssetUploadRouter
from video_generation.adapters.errors import VideoProviderError, classify_video_provider_error
from video_generation.adapters.types import (
    VideoCreateRequest,
    VideoCreateResult,
    VideoInputAsset,
    VideoQueryRequest,
    VideoQueryResult,
)
from video_generation.providers.kie.client import KieClient
from video_generation.providers.kie.payloads import (
    build_kie_create_payload,
    is_kie_i2v_model,
)
from video_generation.providers.kie.result_parser import (
    extract_kie_error_message,
    extract_kie_task_id,
    extract_kie_video_url,
    normalize_kie_status,
)


class KieVideoAdapter:
    provider = "kie"
    adapter_id = "kie:wan"

    def __init__(
        self,
        *,
        client: KieClient | None = None,
        asset_router: ProviderAssetUploadRouter | None = None,
    ):
        self.client = client or KieClient()
        self.asset_router = asset_router or ProviderAssetUploadRouter()

    def supports(self, capability: Mapping[str, Any]) -> bool:
        hints = capability.get("adapterHints") if isinstance(capability.get("adapterHints"), Mapping) else {}
        return capability.get("provider") == self.provider or hints.get("adapterId") == self.adapter_id

    async def build_create_payload(self, request: VideoCreateRequest, capability: Mapping[str, Any]) -> Mapping[str, Any]:
        first_frame_url = None
        last_frame_url = None
        if is_kie_i2v_model(request.model):
            first_frame = self._first_asset(request.inputs.get("image:firstFrame") or [])
            if not first_frame:
                raise ValueError("KIE image-to-video requires image:firstFrame")
            resolved = await self.asset_router.resolve(
                provider="kie",
                asset=first_frame,
                purpose="image:firstFrame",
                project_path=request.project_dir,
            )
            first_frame_url = resolved.url or resolved.data_uri
            if not first_frame_url:
                raise ValueError("KIE image-to-video asset routing did not return a URL")
            last_frame = self._first_asset(request.inputs.get("image:lastFrame") or [])
            if last_frame:
                resolved_last = await self.asset_router.resolve(
                    provider="kie",
                    asset=last_frame,
                    purpose="image:lastFrame",
                    project_path=request.project_dir,
                )
                last_frame_url = resolved_last.url or resolved_last.data_uri
                if not last_frame_url:
                    raise ValueError("KIE image-to-video last-frame routing did not return a URL")

        return build_kie_create_payload(
            model=request.model,
            prompt=request.prompt,
            task_type=request.task_type,
            params=request.params,
            first_frame_url=first_frame_url,
            last_frame_url=last_frame_url,
        )

    async def create(self, request: VideoCreateRequest, capability: Mapping[str, Any]) -> VideoCreateResult:
        payload = await self.build_create_payload(request, capability)
        try:
            response = await self.client.create_task(dict(payload))
        except Exception as exc:
            raise self._provider_error(exc, "KIE create failed") from exc

        task_id = extract_kie_task_id(response)
        data = response.get("data") if isinstance(response.get("data"), dict) else response
        raw_status = str(data.get("state") or data.get("status") or "waiting")
        return VideoCreateResult(
            provider=request.provider,
            model=request.model,
            task_id=task_id,
            status=normalize_kie_status(raw_status),
            raw_status=raw_status,
            message=str(response.get("msg") or response.get("message") or "") or None,
            raw_response=response,
        )

    async def query(self, request: VideoQueryRequest, capability: Mapping[str, Any]) -> VideoQueryResult:
        try:
            response = await self.client.get_task(request.task_id)
        except Exception as exc:
            raise self._provider_error(exc, "KIE query failed") from exc

        data = response.get("data") if isinstance(response.get("data"), dict) else response
        raw_status = str(data.get("state") or data.get("status") or "")
        status = normalize_kie_status(raw_status)
        message = extract_kie_error_message(response) if status == "failed" else str(response.get("msg") or response.get("message") or raw_status or "")
        video_url = extract_kie_video_url(response) if status == "succeeded" else None
        service_status = {
            "running": "running",
            "succeeded": "success",
            "failed": "error",
            "canceled": "cancelled",
            "queued": "queued",
            "unknown": "running",
        }.get(status, "running")
        raw_response = {
            "status": service_status,
            "message": message or service_status,
            "remoteVideoUrl": video_url,
            "raw": response,
        }
        return VideoQueryResult(
            provider=request.provider,
            model=request.model,
            task_id=request.task_id,
            status=status,
            video_url=video_url,
            message=message or None,
            raw_status=raw_status or None,
            raw_response=raw_response,
        )

    def _provider_error(self, exc: Exception, fallback_message: str) -> VideoProviderError:
        if isinstance(exc, VideoProviderError):
            return exc
        message = str(exc) or fallback_message
        category, retryable = classify_video_provider_error(message)
        return VideoProviderError(
            provider=self.provider,
            message=message,
            code=category,
            retryable=retryable,
            category=category,
        )

    def _first_asset(self, assets: list[VideoInputAsset]) -> str | None:
        for asset in assets:
            value = asset.url or asset.path
            if value:
                return value
        return None
