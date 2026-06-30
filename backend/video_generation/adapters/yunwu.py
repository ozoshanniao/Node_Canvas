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
from video_generation.providers.yunwu_veo_provider import YunwuVeoProvider
from video_generation.schemas import VideoGenerateRequest


class YunwuVideoAdapter:
    provider = "yunwu"
    adapter_id = "yunwu:veo"

    def __init__(self, legacy_provider: YunwuVeoProvider | None = None):
        self._legacy_provider = legacy_provider or YunwuVeoProvider()

    def supports(self, capability: Mapping[str, Any]) -> bool:
        hints = capability.get("adapterHints") if isinstance(capability.get("adapterHints"), Mapping) else {}
        return capability.get("provider") == self.provider or hints.get("adapterId") == self.adapter_id

    def create_request_from_generate_request(self, request: VideoGenerateRequest) -> VideoCreateRequest:
        inputs: dict[str, list[VideoInputAsset]] = {}
        if request.videoMode == "reference-video":
            inputs["image:references"] = [
                VideoInputAsset(kind="image", role="reference", url=image, handle_id="image:references")
                for image in request.images
            ]
        elif request.images:
            inputs["image:firstFrame"] = [
                VideoInputAsset(kind="image", role="first_frame", url=request.images[0], handle_id="image:firstFrame")
            ]
        if request.endImage:
            inputs["image:lastFrame"] = [
                VideoInputAsset(kind="image", role="last_frame", url=request.endImage, handle_id="image:lastFrame")
            ]

        return VideoCreateRequest(
            provider=request.provider,
            model=request.model,
            task_type=request.videoMode,
            prompt=request.prompt,
            params={
                "negativePrompt": request.negativePrompt,
                "aspectRatio": request.aspectRatio,
                "enableUpsample": request.enableUpsample,
                "enhancePrompt": request.customParams.get("enhancePrompt"),
                "veoFlClose": request.customParams.get("veoFlClose"),
                "customParams": dict(request.customParams or {}),
            },
            inputs=inputs,
            project_dir=request.projectPath,
        )

    async def build_create_payload(self, request: VideoCreateRequest, capability: Mapping[str, Any]) -> Mapping[str, Any]:
        legacy_request = self._to_legacy_request(request)
        return await self._legacy_provider.build_create_payload(legacy_request)

    async def create(self, request: VideoCreateRequest, capability: Mapping[str, Any]) -> VideoCreateResult:
        try:
            response = await self._legacy_provider.create_task(self._to_legacy_request(request))
        except Exception as exc:
            raise self._provider_error(exc, "Yunwu create failed") from exc

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
            response = await self._legacy_provider.query_task(request.task_id)
        except Exception as exc:
            raise self._provider_error(exc, "Yunwu query failed") from exc

        data = response.get("data") if isinstance(response.get("data"), dict) else response
        raw_status = str(data.get("status") or data.get("state") or response.get("status") or "").strip()
        return VideoQueryResult(
            provider=request.provider,
            model=request.model,
            task_id=request.task_id,
            status=normalize_video_adapter_status(raw_status),
            video_url=self._extract_remote_video_url(data),
            message=str(data.get("message") or response.get("message") or raw_status or "") or None,
            raw_status=raw_status or None,
            raw_response=response,
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
        if request.task_type == "image-to-video" and last_frame:
            end_image = last_frame
        else:
            end_image = None

        custom_params = dict(params.get("customParams") or {})
        for source_key, custom_key in (
            ("enhancePrompt", "enhancePrompt"),
            ("veoFlClose", "veoFlClose"),
        ):
            if params.get(source_key) is not None:
                custom_params[custom_key] = params[source_key]

        return VideoGenerateRequest(
            projectPath=request.project_dir,
            provider=request.provider,
            model=request.model,
            videoMode=request.task_type,
            prompt=request.prompt,
            negativePrompt=params.get("negativePrompt"),
            aspectRatio=params.get("aspectRatio"),
            enableUpsample=params.get("enableUpsample"),
            images=images,
            endImage=end_image,
            customParams=custom_params,
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
        raise ValueError("Yunwu create response did not include a task id")

    def _extract_remote_video_url(self, data: dict[str, Any]) -> str | None:
        for key in ("video_url", "videoUrl", "url", "output_url", "outputUrl", "remoteVideoUrl"):
            value = data.get(key)
            if value:
                return str(value)
        videos = data.get("videos")
        if isinstance(videos, list) and videos:
            first = videos[0]
            if isinstance(first, dict):
                return self._extract_remote_video_url(first)
            if isinstance(first, str):
                return first
        return None

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
