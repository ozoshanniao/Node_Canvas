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
from video_generation.providers.kling import KlingVideoProvider
from video_generation.schemas import VideoGenerateRequest


class KlingVideoAdapter:
    provider = "kling"
    adapter_id = "kling:official"

    def __init__(self, legacy_provider: Any | None = None):
        self._legacy_provider = legacy_provider or KlingVideoProvider(provider_type="kling")

    def supports(self, capability: Mapping[str, Any]) -> bool:
        hints = capability.get("adapterHints") if isinstance(capability.get("adapterHints"), Mapping) else {}
        return capability.get("provider") == self.provider or hints.get("adapterId") == self.adapter_id

    def create_request_from_generate_request(self, request: VideoGenerateRequest) -> VideoCreateRequest:
        if request.videoMode not in {"text-to-video", "image-to-video", "omni-video"}:
            raise ValueError(f"Kling create request bridge does not support mode: {request.videoMode}")

        inputs: dict[str, list[VideoInputAsset]] = {}
        if request.videoMode == "omni-video":
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
                "duration": request.duration,
                "durationSeconds": request.durationSeconds,
                "qualityMode": request.qualityMode,
                "generateAudio": request.generateAudio,
                "customParams": dict(request.customParams or {}),
            },
            inputs=inputs,
            project_dir=request.projectPath,
        )

    async def build_create_payload(self, request: VideoCreateRequest, capability: Mapping[str, Any]) -> Mapping[str, Any]:
        legacy_request = self._to_legacy_request(request)
        endpoint_kind = self._legacy_provider._endpoint_kind(legacy_request)
        return await self._legacy_provider._payload_for_kind(endpoint_kind, legacy_request)

    async def create(self, request: VideoCreateRequest, capability: Mapping[str, Any]) -> VideoCreateResult:
        try:
            response = await self._legacy_provider.create_task(self._to_legacy_request(request))
        except Exception as exc:
            raise self._provider_error(exc, "Kling create failed") from exc

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
            raise self._provider_error(exc, "Kling query failed") from exc

        raw_status = str(response.get("status") or "").strip() if isinstance(response, dict) else ""
        return VideoQueryResult(
            provider=request.provider,
            model=request.model,
            task_id=request.task_id,
            status=normalize_video_adapter_status(raw_status),
            video_url=response.get("remoteVideoUrl") if isinstance(response, dict) else None,
            message=str(response.get("message") or raw_status or "") if isinstance(response, dict) else None,
            raw_status=raw_status or None,
            raw_response=response if isinstance(response, dict) else {"data": response},
        )

    def _to_legacy_request(self, request: VideoCreateRequest) -> VideoGenerateRequest:
        params = request.params or {}
        images = self._image_values_for_request(request)
        end_image = self._first_asset_value(request.inputs.get("image:lastFrame") or request.inputs.get("image:end") or [])

        custom_params = self._custom_params(params)
        generate_audio = self._generate_audio(params)

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
            qualityMode=params.get("qualityMode") or params.get("mode"),
            generateAudio=generate_audio,
            images=images,
            endImage=end_image if request.task_type == "image-to-video" else None,
            customParams=custom_params,
        )

    def _custom_params(self, params: Mapping[str, Any]) -> dict[str, Any]:
        custom_params = dict(params.get("customParams") or {})
        raw_kling_params = custom_params.get("kling")
        kling_params = dict(raw_kling_params) if isinstance(raw_kling_params, Mapping) else {}
        for key in ("cfgScale", "cameraControl", "shotMode", "shotType", "multiPrompt", "omniParams", "elementIds"):
            if params.get(key) is not None:
                kling_params[key] = params[key]
        if kling_params:
            custom_params["kling"] = kling_params
        return custom_params

    def _generate_audio(self, params: Mapping[str, Any]) -> bool | None:
        if params.get("generateAudio") is not None:
            return bool(params.get("generateAudio"))
        sound = params.get("sound")
        if sound is None:
            return None
        if isinstance(sound, str):
            return sound.strip().lower() == "on"
        return bool(sound)

    def _image_values_for_request(self, request: VideoCreateRequest) -> list[str]:
        if request.task_type == "reference-video":
            return self._asset_values(request.inputs.get("image:references") or request.inputs.get("images") or [])
        if request.task_type == "omni-video":
            return self._asset_values(request.inputs.get("image:references") or request.inputs.get("images") or [])
        return self._asset_values(
            request.inputs.get("image:firstFrame")
            or request.inputs.get("image:references")
            or request.inputs.get("images")
            or []
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
        raise ValueError("Kling create response did not include a task id")

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
