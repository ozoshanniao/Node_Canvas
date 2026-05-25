from video_generation.providers.base import BaseVideoProvider
from video_generation.providers.kling.clients import KlingOfficialClient, YunwuKlingClient
from video_generation.providers.kling.omni_payloads import KlingOmniPayloadBuilder
from video_generation.providers.kling.payloads import KlingPayloadBuilder
from video_generation.schemas import VideoGenerateRequest


CREATE_ENDPOINTS = {
    "text2video": "/v1/videos/text2video",
    "image2video": "/v1/videos/image2video",
    "omni-video": "/v1/videos/omni-video",
}

QUERY_ENDPOINTS = {
    "text2video": "/v1/videos/text2video/{task_id}",
    "image2video": "/v1/videos/image2video/{task_id}",
    "omni-video": "/v1/videos/omni-video/{task_id}",
}

KLING_STATUS_MAP = {
    "submitted": "queued",
    "processing": "running",
    "succeed": "success",
    "failed": "error",
}


class KlingVideoProvider(BaseVideoProvider):
    def __init__(self, provider_type: str = "kling"):
        self.provider_type = provider_type
        self.payload_builder = KlingPayloadBuilder()
        self.omni_payload_builder = KlingOmniPayloadBuilder()

    def _client(self):
        if self.provider_type == "yunwu-kling":
            return YunwuKlingClient()
        return KlingOfficialClient()

    def _endpoint_kind(self, request: VideoGenerateRequest) -> str:
        if request.model == "kling-v3-omni":
            return "omni-video"
        if request.videoMode == "text-to-video":
            return "text2video"
        if request.videoMode == "image-to-video":
            return "image2video"
        if request.videoMode == "reference-video":
            return "omni-video"
        raise ValueError(f"Unsupported Kling video mode: {request.videoMode}")

    async def _payload_for_kind(self, endpoint_kind: str, request: VideoGenerateRequest) -> dict:
        project_path = request.projectPath
        if request.model == "kling-v3-omni":
            return await self.omni_payload_builder.build_omni_payload(request, project_path)
        if endpoint_kind == "text2video":
            return await self.payload_builder.build_text2video(request, project_path)
        if endpoint_kind == "image2video":
            return await self.payload_builder.build_image2video(request, project_path)
        if endpoint_kind == "omni-video":
            return await self.payload_builder.build_omni_video(request, project_path)
        raise ValueError(f"Unsupported Kling endpoint kind: {endpoint_kind}")

    def _extract_data(self, response: dict) -> dict:
        data = response.get("data")
        return data if isinstance(data, dict) else response

    async def create_task(self, request: VideoGenerateRequest) -> dict:
        endpoint_kind = self._endpoint_kind(request)
        payload = await self._payload_for_kind(endpoint_kind, request)
        raw = await self._client().post(CREATE_ENDPOINTS[endpoint_kind], payload)
        data = self._extract_data(raw)
        task_id = data.get("task_id") or data.get("taskId")
        if not task_id:
            raise ValueError(f"Kling create response did not include a task id: {raw}")

        raw_status = str(data.get("task_status") or data.get("status") or "submitted")
        return {
            "providerTaskId": f"{endpoint_kind}:{task_id}",
            "status": KLING_STATUS_MAP.get(raw_status, "queued"),
            "message": data.get("task_status_msg") or raw_status,
            "raw": raw,
        }

    async def query_task(self, provider_task_id: str) -> dict:
        if ":" not in provider_task_id:
            raise ValueError(f"Invalid Kling provider task id: {provider_task_id}")
        endpoint_kind, task_id = provider_task_id.split(":", 1)
        endpoint_template = QUERY_ENDPOINTS.get(endpoint_kind)
        if not endpoint_template:
            raise ValueError(f"Unsupported Kling endpoint kind: {endpoint_kind}")

        raw = await self._client().get(endpoint_template.format(task_id=task_id))
        data = self._extract_data(raw)
        raw_status = str(data.get("task_status") or data.get("status") or "").strip()
        status = KLING_STATUS_MAP.get(raw_status, "running" if raw_status else "running")
        message = data.get("task_status_msg") or raw.get("message") or raw_status or status
        remote_url = None

        if status == "success":
            videos = (
                data.get("task_result", {}).get("videos")
                if isinstance(data.get("task_result"), dict)
                else None
            )
            if isinstance(videos, list) and videos:
                first = videos[0]
                if isinstance(first, dict):
                    remote_url = first.get("url") or first.get("video_url") or first.get("videoUrl")
                elif isinstance(first, str):
                    remote_url = first
            if not remote_url:
                status = "error"
                message = "Kling task succeeded but no video URL was returned"

        return {
            "status": status,
            "remoteVideoUrl": remote_url,
            "message": f"Kling: {message}" if status == "error" and not str(message).startswith("Kling:") else message,
            "raw": raw,
        }
