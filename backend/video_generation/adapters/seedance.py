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
from video_generation.providers.seedance_official.provider import SeedanceOfficialProvider
from video_generation.schemas import VideoGenerateRequest


class SeedanceOfficialVideoAdapter:
    provider = "seedance_official"
    adapter_id = "seedance:official"

    def __init__(self, legacy_provider: Any | None = None):
        self._legacy_provider = legacy_provider

    @property
    def legacy_provider(self) -> Any:
        if self._legacy_provider is None:
            self._legacy_provider = SeedanceOfficialProvider()
        return self._legacy_provider

    def supports(self, capability: Mapping[str, Any]) -> bool:
        hints = capability.get("adapterHints") if isinstance(capability.get("adapterHints"), Mapping) else {}
        return capability.get("provider") == self.provider or hints.get("adapterId") == self.adapter_id

    async def build_create_payload(self, request: VideoCreateRequest, capability: Mapping[str, Any]) -> Mapping[str, Any]:
        legacy_request = self._to_legacy_request(request)
        resolved_request = await self.legacy_provider._resolve_request_assets(legacy_request)
        return await self.legacy_provider.payload_builder.build_payload(resolved_request, resolved_request.projectPath)

    async def create(self, request: VideoCreateRequest, capability: Mapping[str, Any]) -> VideoCreateResult:
        try:
            response = await self.legacy_provider.create_task(self._to_legacy_request(request))
        except Exception as exc:
            raise self._provider_error(exc, "Seedance create failed") from exc

        task_id = self._extract_provider_task_id(response)
        raw_status = str(response.get("status") or "") if isinstance(response, dict) else ""
        return VideoCreateResult(
            provider=request.provider,
            model=request.model,
            task_id=task_id,
            status=normalize_video_adapter_status(raw_status) if raw_status else "queued",
            raw_status=raw_status or None,
            message=str(response.get("message") or "") if isinstance(response, dict) and response.get("message") else None,
            raw_response=response if isinstance(response, dict) else {"data": response},
        )

    async def query(self, request: VideoQueryRequest, capability: Mapping[str, Any]) -> VideoQueryResult:
        try:
            response = await self.legacy_provider.query_task(request.task_id)
        except Exception as exc:
            raise self._provider_error(exc, "Seedance query failed") from exc

        raw_status = str(response.get("status") or "").strip() if isinstance(response, dict) else ""
        return VideoQueryResult(
            provider=request.provider,
            model=request.model,
            task_id=request.task_id,
            status=normalize_video_adapter_status(raw_status),
            video_url=response.get("remoteVideoUrl") if isinstance(response, dict) else None,
            last_frame_url=response.get("lastFrameRemoteUrl") if isinstance(response, dict) else None,
            message=str(response.get("message") or raw_status or "") if isinstance(response, dict) else None,
            raw_status=raw_status or None,
            raw_response=response if isinstance(response, dict) else {"data": response},
        )

    def _to_legacy_request(self, request: VideoCreateRequest) -> VideoGenerateRequest:
        params = request.params or {}
        seedance_params = self._seedance_params(request, params)

        return VideoGenerateRequest(
            projectPath=request.project_dir,
            provider=request.provider,
            model=request.model,
            videoMode=request.task_type,
            prompt=request.prompt,
            aspectRatio=params.get("aspectRatio") or params.get("ratio"),
            duration=params.get("duration"),
            durationSeconds=params.get("durationSeconds"),
            resolution=params.get("resolution"),
            generateAudio=params.get("generateAudio"),
            returnLastFrame=params.get("returnLastFrame"),
            publicAssetStorage=params.get("publicAssetStorage"),
            seed=params.get("seed"),
            images=self._asset_values(request.inputs.get("image:firstFrame") or []),
            endImage=self._first_asset_value(request.inputs.get("image:lastFrame") or []),
            customParams={
                **dict(params.get("customParams") or {}),
                "seedance": seedance_params,
            },
        )

    def _seedance_params(self, request: VideoCreateRequest, params: Mapping[str, Any]) -> dict[str, Any]:
        custom_params = dict(params.get("customParams") or {})
        raw_seedance_params = custom_params.get("seedance")
        seedance_params = dict(raw_seedance_params) if isinstance(raw_seedance_params, Mapping) else {}
        seedance_params.setdefault("mode", params.get("mode") or request.task_type)

        first_frame = self._first_asset_value(request.inputs.get("image:firstFrame") or [])
        last_frame = self._first_asset_value(request.inputs.get("image:lastFrame") or [])
        images = self._asset_values(request.inputs.get("image:references") or [])
        videos = self._asset_values(request.inputs.get("video:references") or [])
        audios = self._asset_values(request.inputs.get("audio:references") or [])

        if first_frame and "firstFrame" not in seedance_params:
            seedance_params["firstFrame"] = first_frame
        if last_frame and "lastFrame" not in seedance_params:
            seedance_params["lastFrame"] = last_frame
        if images and "images" not in seedance_params:
            seedance_params["images"] = images
        if videos and "videos" not in seedance_params:
            seedance_params["videos"] = videos
        if audios and "audios" not in seedance_params:
            seedance_params["audios"] = audios
        return seedance_params

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
        for key in ("providerTaskId", "id", "task_id", "taskId"):
            value = data.get(key) if isinstance(data, dict) else None
            if value:
                return str(value)
        raise ValueError("Seedance create response did not include a task id")

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
