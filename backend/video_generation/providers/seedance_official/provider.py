from video_generation.providers.base import BaseVideoProvider
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

    def _extract_video_url(self, data: dict) -> str | None:
        for key in ("video_url", "videoUrl", "url", "output_url", "outputUrl"):
            value = data.get(key)
            if value:
                return str(value)
        content = data.get("content")
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

    async def create_task(self, request: VideoGenerateRequest) -> dict:
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
            "message": f"Seedance: {message}" if status == "error" and not str(message).startswith("Seedance:") else message,
            "raw": raw,
        }
