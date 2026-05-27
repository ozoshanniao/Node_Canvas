import time
import uuid
import json
from typing import Any

from video_generation.providers.yunwu_veo_provider import YunwuVeoProvider
from video_generation.providers.google_veo_provider import GoogleVeoProvider
from video_generation.providers.kling import KlingVideoProvider
from video_generation.providers.seedance_official import SeedanceOfficialProvider
from video_generation.schemas import VideoGenerateRequest, VideoTask
from video_generation.specs import get_video_model_specs
from video_generation.storage import download_video_to_project
from video_generation.tasks import get_task, upsert_task


YUNWU_STATUS_MAP = {
    "pending": "queued",
    "image_downloading": "running",
    "video_generating": "running",
    "video_generation_completed": "running",
    "video_upsampling": "running",
    "video_upsampling_completed": "running",
    "completed": "success",
    "video_generation_failed": "error",
    "video_upsampling_failed": "error",
    "failed": "error",
    "error": "error",
}


class VideoGenerationService:
    def __init__(self, yunwu_api_key: str | None = None):
        self.providers = {
            "yunwu": YunwuVeoProvider(api_key=yunwu_api_key),
            "google": GoogleVeoProvider(),
            "seedance_official": SeedanceOfficialProvider(),
            "kling": KlingVideoProvider(provider_type="kling"),
            "yunwu-kling": KlingVideoProvider(provider_type="yunwu-kling"),
        }

    def get_model_specs(self) -> dict:
        return get_video_model_specs()

    def _find_model(self, provider_id: str, model_id: str) -> dict | None:
        for provider in self.get_model_specs().get("providers", []):
            if provider.get("id") != provider_id:
                continue
            for model in provider.get("models", []):
                if model.get("id") == model_id:
                    return model
        return None

    def _validate_request(self, request: VideoGenerateRequest) -> None:
        model = self._find_model(request.provider, request.model)
        if not model:
            raise ValueError(f"Unsupported video model: {request.provider}/{request.model}")
        if request.videoMode not in model.get("supportedModes", []):
            raise ValueError(f"Unsupported video mode for model: {request.videoMode}")
        if request.provider == "yunwu" and request.videoMode == "reference-video" and request.model != "veo3.1-components":
            raise ValueError("reference-video requires veo3.1-components")

    def _extract_provider_task_id(self, response: dict[str, Any]) -> str:
        data = response.get("data") if isinstance(response.get("data"), dict) else response
        for key in ("providerTaskId", "id", "task_id", "taskId", "video_id", "videoId", "name"):
            value = data.get(key) if isinstance(data, dict) else None
            if value:
                return str(value)
        raise ValueError("Yunwu create response did not include a task id")

    def _extract_query_data(self, response: dict[str, Any]) -> dict[str, Any]:
        data = response.get("data")
        return data if isinstance(data, dict) else response

    def _path_value(self, source: dict[str, Any], path: tuple[str, ...]) -> Any:
        current = source
        for key in path:
            if not isinstance(current, dict) or key not in current:
                return None
            current = current[key]
        return current

    def _message_value(self, value: Any) -> str | None:
        if value is None:
            return None
        if isinstance(value, str):
            return value.strip() or None
        try:
            return json.dumps(value, ensure_ascii=False)
        except TypeError:
            return str(value)

    def _extract_error_message(self, response: dict[str, Any], data: dict[str, Any], provider_status: str) -> str:
        candidates = [
            self._path_value(response, ("detail", "video_generation_error")),
            self._path_value(response, ("detail", "error_message")),
            self._path_value(data, ("detail", "video_generation_error")),
            self._path_value(data, ("detail", "error_message")),
            data.get("video_generation_error"),
            data.get("error_message"),
            response.get("video_generation_error"),
            response.get("error_message"),
            data.get("message"),
            response.get("message"),
            provider_status,
            "Video generation failed after max retries",
        ]
        for candidate in candidates:
            message = self._message_value(candidate)
            if message:
                return f"Yunwu: {message}"
        return "Yunwu: Video generation failed after max retries"

    def _extract_remote_video_url(self, data: dict[str, Any]) -> str | None:
        for key in ("video_url", "videoUrl", "url", "output_url", "outputUrl"):
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

    def _provider_label(self, provider_id: str | None) -> str:
        return {
            "google": "Google",
            "kling": "Kling",
            "yunwu-kling": "Yunwu-Kling",
            "seedance_official": "Seedance",
            "yunwu": "Yunwu",
        }.get(provider_id or "", provider_id or "Provider")

    def _normalize_query_result(self, response: dict[str, Any], provider_id: str | None = None) -> tuple[str, str, str | None]:
        if response.get("status") in {"queued", "running", "success", "error", "cancelled"}:
            status = response.get("status")
            message = str(response.get("message") or status)
            remote_url = response.get("remoteVideoUrl")
            label = self._provider_label(provider_id)
            known_prefixes = ("Google:", "Kling:", "Yunwu-Kling:", "Seedance:", "Yunwu:")
            if status == "error" and not message.startswith(known_prefixes):
                message = f"{label}: {message}"
            return status, message, remote_url

        data = self._extract_query_data(response)
        provider_status = str(data.get("status") or data.get("state") or "").strip()
        status = YUNWU_STATUS_MAP.get(provider_status, "running" if provider_status else "running")
        if status == "error":
            message = self._extract_error_message(response, data, provider_status)
        else:
            message = str(data.get("message") or response.get("message") or provider_status or status)
        remote_url = self._extract_remote_video_url(data)
        if status == "success" and not remote_url:
            status = "running"
            message = "Waiting for video URL"
        return status, message, remote_url

    def _progress_for_status(self, status: str) -> int:
        if status == "queued":
            return 5
        if status == "running":
            return 60
        if status == "success":
            return 100
        return 0

    async def create_task(self, project_path: str, request: VideoGenerateRequest) -> VideoTask:
        if not project_path:
            raise ValueError("projectPath is required")
        self._validate_request(request)

        provider = self.providers.get(request.provider)
        if not provider:
            raise ValueError(f"Unsupported provider: {request.provider}")

        now = int(time.time())
        task_id = f"video_{uuid.uuid4().hex[:12]}"
        request.projectPath = project_path
        provider_response = await provider.create_task(request)
        provider_task_id = self._extract_provider_task_id(provider_response)
        provider_status = provider_response.get("status") if isinstance(provider_response, dict) else None

        task = VideoTask(
            id=task_id,
            provider=request.provider,
            model=request.model,
            videoMode=request.videoMode,
            status=provider_status if provider_status in {"queued", "running"} else "queued",
            progress=self._progress_for_status(provider_status if provider_status in {"queued", "running"} else "queued"),
            message="Video task queued." if request.provider != "google" else "Google video task started.",
            providerTaskId=provider_task_id,
            outputs={
                "videoUrl": "",
                "coverUrl": "",
                "previewFrames": [],
                "rawCreateResponse": provider_response.get("raw", provider_response) if isinstance(provider_response, dict) else provider_response,
            },
            request=request.model_dump(),
            createdAt=now,
            updatedAt=now,
        )
        await upsert_task(project_path, task)
        return task

    async def query_task(self, project_path: str, task_id: str) -> VideoTask:
        if not project_path:
            raise ValueError("projectPath is required")

        task = await get_task(project_path, task_id)
        if not task:
            raise KeyError(f"Video task not found: {task_id}")
        if task.status in {"success", "error", "cancelled"}:
            return task

        provider = self.providers.get(task.provider)
        if not provider:
            raise ValueError(f"Unsupported provider: {task.provider}")

        try:
            response = await provider.query_task(task.providerTaskId)
            status, message, remote_url = self._normalize_query_result(response, task.provider)
            query_data = self._extract_query_data(response)
            raw_status = str(query_data.get("status") or query_data.get("state") or "").strip()
            print(
                f"[VideoGeneration:{self._provider_label(task.provider)} query]",
                {
                    "providerTaskId": task.providerTaskId,
                    "rawStatus": raw_status,
                    "mappedStatus": status,
                    "message": message,
                },
            )
            now = int(time.time())
            patch = {
                "status": status,
                "progress": self._progress_for_status(status),
                "message": message,
                "remoteVideoUrl": remote_url or task.remoteVideoUrl,
                "outputs": {
                    **task.outputs,
                    "rawQueryResponse": response.get("raw", response) if isinstance(response, dict) else response,
                },
                "updatedAt": now,
                "error": message if status == "error" else None,
            }

            if status == "success" and response.get("videoBytes"):
                try:
                    from video_generation.storage import save_video_bytes_to_project

                    local_url = save_video_bytes_to_project(project_path, response["videoBytes"], task.id)
                    patch["localVideoUrl"] = local_url
                    patch["outputs"] = {
                        **patch["outputs"],
                        "videoUrl": local_url,
                    }
                    patch["message"] = "Video generation completed."
                except Exception as exc:
                    patch["status"] = "error"
                    patch["progress"] = 0
                    patch["error"] = str(exc)
                    patch["message"] = f"Video completed, but saving failed: {exc}"
            elif status == "success" and remote_url:
                try:
                    local_url = await download_video_to_project(project_path, remote_url, task.id)
                    patch["localVideoUrl"] = local_url
                    patch["outputs"] = {
                        **patch["outputs"],
                        "videoUrl": local_url,
                    }
                    patch["message"] = "Video generation completed."
                except Exception as exc:
                    patch["status"] = "error"
                    patch["progress"] = 0
                    patch["error"] = str(exc)
                    patch["message"] = f"Video completed, but download failed: {exc}"

            updated = task.model_copy(update=patch)
            await upsert_task(project_path, updated)
            return updated
        except Exception as exc:
            now = int(time.time())
            updated = task.model_copy(
                update={
                    "status": "error",
                    "progress": 0,
                    "message": str(exc),
                    "error": str(exc),
                    "updatedAt": now,
                }
            )
            await upsert_task(project_path, updated)
            return updated
