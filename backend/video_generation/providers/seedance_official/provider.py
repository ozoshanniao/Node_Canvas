from video_generation.providers.base import BaseVideoProvider
from video_generation.providers.seedance_official.assets import (
    resolve_seedance_audio_asset,
    resolve_seedance_image_asset,
    seedance_asset_config_from_env,
)
from video_generation.providers.seedance_official.client import SeedanceOfficialClient
from video_generation.providers.seedance_official.payloads import SeedancePayloadBuilder
from video_generation.schemas import VideoGenerateRequest


SEEDANCE_STATUS_MAP = {
    "queued": "queued",
    "pending": "queued",
    "submitted": "queued",
    "running": "running",
    "processing": "running",
    "in_progress": "running",
    "succeeded": "success",
    "success": "success",
    "completed": "success",
    "failed": "error",
    "error": "error",
    "cancelled": "cancelled",
    "canceled": "cancelled",
}


class SeedanceOfficialProvider(BaseVideoProvider):
    def __init__(
        self,
        client: SeedanceOfficialClient | None = None,
        payload_builder: SeedancePayloadBuilder | None = None,
    ):
        self.client = client or SeedanceOfficialClient()
        self.payload_builder = payload_builder or SeedancePayloadBuilder()

    def _extract_data(self, response: dict) -> dict:
        data = response.get("data")
        return data if isinstance(data, dict) else response

    def _extract_task_id(self, response: dict) -> str:
        data = self._extract_data(response)
        for key in ("id", "task_id", "taskId"):
            value = data.get(key)
            if value:
                return str(value)
        raise ValueError(f"Seedance create response did not include a task id: {response}")

    def _seedance_params(self, request: VideoGenerateRequest) -> dict:
        params = request.customParams.get("seedance") if isinstance(request.customParams, dict) else None
        return params if isinstance(params, dict) else {}

    async def _resolve_request_assets(self, request: VideoGenerateRequest) -> VideoGenerateRequest:
        params = self._seedance_params(request)
        mode = params.get("mode") or request.videoMode
        seedance_params = {**params}
        custom_params = {**(request.customParams or {}), "seedance": seedance_params}
        project_path = request.projectPath
        config = seedance_asset_config_from_env()
        image_state = {"image_base64_total_bytes": 0}

        if mode == "frame":
            first_frame = params.get("firstFrame") or (request.images[0] if request.images else None)
            last_frame = params.get("lastFrame") or request.endImage
            if first_frame:
                seedance_params["firstFrame"] = await resolve_seedance_image_asset(
                    first_frame,
                    public_asset_service=self.payload_builder.public_assets,
                    project_root=project_path,
                    base64_state=image_state,
                    config=config,
                )
            if last_frame:
                seedance_params["lastFrame"] = await resolve_seedance_image_asset(
                    last_frame,
                    public_asset_service=self.payload_builder.public_assets,
                    project_root=project_path,
                    base64_state=image_state,
                    config=config,
                )
            return request.model_copy(update={"customParams": custom_params})

        if mode != "multimodal-reference":
            return request

        images = [value for value in (params.get("images") or []) if value]
        videos = [value for value in (params.get("videos") or []) if value]
        audios = [value for value in (params.get("audios") or []) if value]

        if len(audios) > 3:
            raise ValueError("Seedance multimodal-reference supports at most 3 audios")
        if audios and not images and not videos:
            raise ValueError("Seedance multimodal-reference does not allow audio-only references")

        seedance_params["images"] = [
            await resolve_seedance_image_asset(
                image,
                public_asset_service=self.payload_builder.public_assets,
                project_root=project_path,
                base64_state=image_state,
                config=config,
            )
            for image in images
        ]
        seedance_params["videos"] = [
            await self.payload_builder.public_assets.ensure_public_url(video, project_path)
            for video in videos
        ]
        seedance_params["audios"] = [
            await resolve_seedance_audio_asset(
                audio,
                public_asset_service=self.payload_builder.public_assets,
                project_root=project_path,
                config=config,
            )
            for audio in audios
        ]
        return request.model_copy(update={"customParams": custom_params})

    def _extract_video_url(self, data: dict) -> str | None:
        for key in ("video_url", "videoUrl", "url", "output_url", "outputUrl"):
            value = data.get(key)
            if value:
                return str(value)
        content = data.get("content")
        if isinstance(content, dict):
            video_url = content.get("video_url")
            if isinstance(video_url, dict) and video_url.get("url"):
                return str(video_url["url"])
            if isinstance(video_url, str):
                return video_url
        if isinstance(content, list):
            for item in content:
                if not isinstance(item, dict):
                    continue
                video_url = item.get("video_url")
                if isinstance(video_url, dict) and video_url.get("url"):
                    return str(video_url["url"])
                if isinstance(video_url, str):
                    return video_url
        videos = data.get("videos") or data.get("outputs")
        if isinstance(videos, list) and videos:
            first = videos[0]
            if isinstance(first, dict):
                return self._extract_video_url(first)
            if isinstance(first, str):
                return first
        return None

    def _extract_last_frame_url(self, data: dict, raw: dict) -> str | None:
        for source in (data, raw):
            content = source.get("content") if isinstance(source, dict) else None
            if isinstance(content, dict) and content.get("last_frame_url"):
                return str(content["last_frame_url"])
            if isinstance(content, list):
                for item in content:
                    if isinstance(item, dict) and item.get("last_frame_url"):
                        return str(item["last_frame_url"])
            value = source.get("last_frame_url") if isinstance(source, dict) else None
            if value:
                return str(value)
        return None

    async def create_task(self, request: VideoGenerateRequest) -> dict:
        request = await self._resolve_request_assets(request)
        payload = await self.payload_builder.build_payload(request, request.projectPath)
        raw = await self.client.create_task(payload)
        data = self._extract_data(raw)
        raw_status = str(data.get("status") or data.get("state") or "queued").lower()
        return {
            "providerTaskId": self._extract_task_id(raw),
            "status": SEEDANCE_STATUS_MAP.get(raw_status, "queued"),
            "message": data.get("message") or raw_status,
            "raw": raw,
        }

    async def query_task(self, provider_task_id: str) -> dict:
        raw = await self.client.query_task(provider_task_id)
        data = self._extract_data(raw)
        raw_status = str(data.get("status") or data.get("state") or "").lower()
        status = SEEDANCE_STATUS_MAP.get(raw_status, "running" if raw_status else "running")
        message = data.get("message") or raw.get("message") or raw_status or status
        remote_url = self._extract_video_url(data)
        if status == "success" and not remote_url:
            status = "running"
            message = "Waiting for Seedance video URL"
        return {
            "status": status,
            "remoteVideoUrl": remote_url,
            "lastFrameRemoteUrl": self._extract_last_frame_url(data, raw) if status == "success" else None,
            "message": f"Seedance: {message}" if status == "error" and not str(message).startswith("Seedance:") else message,
            "raw": raw,
        }
