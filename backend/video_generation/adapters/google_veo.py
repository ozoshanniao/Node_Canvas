from __future__ import annotations

from typing import Any, Mapping

from video_generation.adapters.errors import VideoProviderError, classify_video_provider_error
from video_generation.adapters.types import (
    VideoCreateRequest,
    VideoCreateResult,
    VideoInputAsset,
    VideoQueryRequest,
    VideoQueryResult,
    normalize_video_adapter_status,
)
from video_generation.providers.google_veo_provider import GoogleVeoProvider
from video_generation.schemas import VideoGenerateRequest


class GoogleVeoVideoAdapter:
    provider = "google"
    adapter_id = "google:veo"

    def __init__(self, legacy_provider: GoogleVeoProvider | None = None):
        self._legacy_provider = legacy_provider or GoogleVeoProvider()

    def supports(self, capability: Mapping[str, Any]) -> bool:
        hints = capability.get("adapterHints") if isinstance(capability.get("adapterHints"), Mapping) else {}
        return capability.get("provider") == self.provider or hints.get("adapterId") == self.adapter_id

    async def build_create_payload(self, request: VideoCreateRequest, capability: Mapping[str, Any]) -> Mapping[str, Any]:
        return await self._legacy_provider.build_create_payload(self._to_legacy_request(request))

    async def create(self, request: VideoCreateRequest, capability: Mapping[str, Any]) -> VideoCreateResult:
        try:
            response = await self._legacy_provider.create_task(self._to_legacy_request(request))
        except Exception as exc:
            raise self._provider_error(exc, "Google Veo create failed") from exc

        task_id = self._extract_provider_task_id(response)
        raw_status = str(response.get("status") or "") if isinstance(response, dict) else ""
        return VideoCreateResult(
            provider=request.provider,
            model=request.model,
            task_id=task_id,
            status=normalize_video_adapter_status(raw_status) if raw_status else "running",
            raw_status=raw_status or None,
            message=str(response.get("message") or "") if isinstance(response, dict) and response.get("message") else None,
            raw_response=response if isinstance(response, dict) else {"data": response},
        )

    async def query(self, request: VideoQueryRequest, capability: Mapping[str, Any]) -> VideoQueryResult:
        try:
            response = await self._legacy_provider.query_task(request.task_id)
        except Exception as exc:
            raise self._provider_error(exc, "Google Veo query failed") from exc

        status = str(response.get("status") or "").strip()
        return VideoQueryResult(
            provider=request.provider,
            model=request.model,
            task_id=request.task_id,
            status=normalize_video_adapter_status(status),
            video_url=response.get("remoteVideoUrl"),
            message=str(response.get("message") or status or "") or None,
            raw_status=status or None,
            raw_response=response,
            video_bytes=response.get("videoBytes"),
        )

    def _to_legacy_request(self, request: VideoCreateRequest) -> VideoGenerateRequest:
        params = request.params or {}
        images = self._asset_values(
            request.inputs.get("image:firstFrame")
            or request.inputs.get("image:references")
            or request.inputs.get("images")
            or []
        )
        last_frame = self._first_asset_value(request.inputs.get("image:lastFrame") or request.inputs.get("image:end") or [])

        return VideoGenerateRequest(
            projectPath=request.project_dir,
            provider=request.provider,
            model=request.model,
            videoMode=request.task_type,
            prompt=request.prompt,
            negativePrompt=params.get("negativePrompt"),
            aspectRatio=params.get("aspectRatio"),
            duration=params.get("duration"),
            durationSeconds=params.get("durationSeconds"),
            resolution=params.get("resolution"),
            generateAudio=params.get("generateAudio"),
            seed=params.get("seed"),
            numberOfVideos=params.get("numberOfVideos"),
            images=images,
            endImage=last_frame if request.task_type == "image-to-video" else None,
            customParams=dict(params.get("customParams") or {}),
        )

    def _provider_error(self, exc: Exception, fallback_message: str) -> VideoProviderError:
        message = str(exc) or fallback_message
        category, retryable = classify_video_provider_error(message)
        return VideoProviderError(
            provider=self.provider,
            message=message,
            code=category,
            retryable=retryable,
            category=category,
        )

    def _extract_provider_task_id(self, response: dict[str, Any]) -> str:
        data = response.get("data") if isinstance(response.get("data"), dict) else response
        for key in ("providerTaskId", "id", "task_id", "taskId", "video_id", "videoId", "name"):
            value = data.get(key) if isinstance(data, dict) else None
            if value:
                return str(value)
        raise ValueError("Google Veo create response did not include an operation name")

    def _asset_values(self, assets: list[VideoInputAsset]) -> list[str]:
        return [value for value in (self._asset_value(asset) for asset in assets) if value]

    def _first_asset_value(self, assets: list[VideoInputAsset]) -> str | None:
        for asset in assets:
            value = self._asset_value(asset)
            if value:
                return value
        return None

    def _asset_value(self, asset: VideoInputAsset) -> str | None:
        return asset.url or asset.path
