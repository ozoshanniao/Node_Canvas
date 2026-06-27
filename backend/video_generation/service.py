import time
import uuid

from video_generation.adapters.registry import get_video_adapter, register_video_adapter
from video_generation.adapters.types import VideoCreateRequest, VideoInputAsset, VideoQueryRequest
from video_generation.adapters.google_veo import GoogleVeoVideoAdapter
from video_generation.adapters.kie import KieVideoAdapter
from video_generation.adapters.kling import KlingVideoAdapter
from video_generation.adapters.seedance import SeedanceOfficialVideoAdapter
from video_generation.adapters.yunwu import YunwuVideoAdapter
from video_generation.adapters.yunwu_kling import YunwuKlingVideoAdapter
from video_generation.providers.yunwu_veo_provider import YunwuVeoProvider
from video_generation.providers.google_veo_provider import GoogleVeoProvider
from video_generation.providers.kling import KlingVideoProvider
from video_generation.providers.seedance_official import SeedanceOfficialProvider
from video_generation.schemas import VideoGenerateRequest, VideoTask, sanitize_task_text
from video_generation.specs import get_video_model_specs
from video_generation.storage import download_video_to_project, save_video_bytes_to_project, video_relative_path
from video_generation.tasks import get_task, normalize_relative_artifact_path, upsert_task
from image_generation.storage import download_image_to_generation, safe_generation_filename_stem



class VideoGenerationService:
    def __init__(self, yunwu_api_key: str | None = None):
        self.providers = {
            "yunwu": YunwuVeoProvider(api_key=yunwu_api_key),
            "google": GoogleVeoProvider(),
            "seedance_official": SeedanceOfficialProvider(),
            "kling": KlingVideoProvider(provider_type="kling"),
            "yunwu-kling": KlingVideoProvider(provider_type="yunwu-kling"),
            "kie": object(),
        }
        register_video_adapter(YunwuVideoAdapter(self.providers["yunwu"]))
        register_video_adapter(GoogleVeoVideoAdapter(self.providers["google"]))
        register_video_adapter(KlingVideoAdapter(self.providers["kling"]))
        register_video_adapter(YunwuKlingVideoAdapter(self.providers["yunwu-kling"]))
        register_video_adapter(SeedanceOfficialVideoAdapter(self.providers["seedance_official"]))
        register_video_adapter(KieVideoAdapter())

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

    def _normalize_public_asset_storage(self, value: str | None) -> str | None:
        storage = (value or "").strip().lower()
        return storage or None

    def _kling_create_request(self, request: VideoGenerateRequest) -> VideoCreateRequest:
        inputs: dict[str, list[VideoInputAsset]] = {}
        if request.videoMode in {"reference-video", "omni-video"}:
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

    def _seedance_create_request(self, request: VideoGenerateRequest) -> VideoCreateRequest:
        raw_seedance_params = (request.customParams or {}).get("seedance")
        seedance_params = dict(raw_seedance_params) if isinstance(raw_seedance_params, dict) else {}
        inputs: dict[str, list[VideoInputAsset]] = {}
        if request.images:
            if request.videoMode == "frame":
                inputs["image:firstFrame"] = [
                    VideoInputAsset(kind="image", role="first_frame", url=request.images[0], handle_id="image:firstFrame")
                ]
            else:
                inputs["image:references"] = [
                    VideoInputAsset(kind="image", role="reference", url=image, handle_id="image:references")
                    for image in request.images
                ]
        if request.endImage:
            inputs["image:lastFrame"] = [
                VideoInputAsset(kind="image", role="last_frame", url=request.endImage, handle_id="image:lastFrame")
            ]
        for key, handle_id, kind, role in (
            ("videos", "video:references", "video", "reference"),
            ("audios", "audio:references", "audio", "reference"),
        ):
            values = [value for value in seedance_params.get(key, []) if value] if isinstance(seedance_params.get(key), list) else []
            if values:
                inputs[handle_id] = [
                    VideoInputAsset(kind=kind, role=role, url=value, handle_id=handle_id)
                    for value in values
                ]

        return VideoCreateRequest(
            provider=request.provider,
            model=request.model,
            task_type=request.videoMode,
            prompt=request.prompt,
            params={
                "aspectRatio": request.aspectRatio,
                "duration": request.duration,
                "durationSeconds": request.durationSeconds,
                "resolution": request.resolution,
                "generateAudio": request.generateAudio,
                "returnLastFrame": request.returnLastFrame,
                "publicAssetStorage": request.publicAssetStorage,
                "seed": request.seed,
                "customParams": dict(request.customParams or {}),
            },
            inputs=inputs,
            project_dir=request.projectPath,
        )

    def _kie_create_request(self, request: VideoGenerateRequest) -> VideoCreateRequest:
        inputs: dict[str, list[VideoInputAsset]] = {}
        if request.images:
            inputs["image:firstFrame"] = [
                VideoInputAsset(kind="image", role="first_frame", url=request.images[0], handle_id="image:firstFrame")
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
                "resolution": request.resolution,
                "seed": request.seed,
            },
            inputs=inputs,
            project_dir=request.projectPath,
        )

    def _provider_label(self, provider_id: str | None) -> str:
        return {
            "google": "Google Cloud",
            "kling": "Kling",
            "yunwu-kling": "Yunwu-Kling",
            "seedance_official": "Seedance",
            "yunwu": "Yunwu",
            "kie": "KIE",
        }.get(provider_id or "", provider_id or "Provider")

    async def _download_seedance_last_frame(
        self,
        project_path: str,
        provider_task_id: str,
        remote_url: str,
    ) -> tuple[dict[str, Any] | None, str | None]:
        try:
            filename_stem = f"{safe_generation_filename_stem(provider_task_id)}_last_frame"
            return await download_image_to_generation(project_path, remote_url, filename_stem), None
        except Exception as exc:
            warning = sanitize_task_text(f"Seedance last frame download failed: {exc}", fallback="Seedance last frame download failed.")
            print(f"[VideoGeneration:Seedance lastFrame] {warning}")
            return None, warning

    def _progress_for_status(self, status: str) -> int:
        if status == "queued":
            return 5
        if status == "running":
            return 60
        if status == "success":
            return 100
        return 0

    def _is_recoverable_query_error(self, task: VideoTask) -> bool:
        if task.status != "error" or not task.providerTaskId:
            return False
        if isinstance(task.outputs.get("video"), dict) and task.outputs["video"].get("relativePath"):
            return False
        message = f"{task.message or ''} {task.error or ''}".lower()
        return "query" in message or "interrupted" in message

    def _service_status(self, adapter_status: str | None) -> str:
        return {
            "queued": "queued",
            "running": "running",
            "succeeded": "success",
            "failed": "error",
            "canceled": "cancelled",
            "cancelled": "cancelled",
            "success": "success",
            "error": "error",
        }.get(str(adapter_status or "").lower(), "running")

    def _interrupted_patch(self, task: VideoTask, error: Exception | str, outputs: dict[str, Any] | None = None) -> dict[str, Any]:
        safe_error = sanitize_task_text(error, fallback="Video task query interrupted.")
        return {
            "status": "interrupted",
            "progress": task.progress,
            "message": "Video task query interrupted. You can retry querying this task.",
            "error": safe_error,
            "outputs": outputs if outputs is not None else task.outputs,
            "updatedAt": int(time.time()),
        }

    async def create_task(self, project_path: str, request: VideoGenerateRequest) -> VideoTask:
        if not project_path:
            raise ValueError("projectPath is required")
        self._validate_request(request)

        provider = self.providers.get(request.provider)
        if not provider:
            raise ValueError(f"Unsupported provider: {request.provider}")

        request.projectPath = project_path
        request.publicAssetStorage = self._normalize_public_asset_storage(request.publicAssetStorage)
        capability = self._find_model(request.provider, request.model) or {}
        if request.provider == "yunwu":
            adapter = get_video_adapter("yunwu")
            create_request = adapter.create_request_from_generate_request(request)
        elif request.provider == "google":
            adapter = get_video_adapter("google")
            create_request = adapter.create_request_from_generate_request(request)
        elif request.provider == "kling":
            register_video_adapter(KlingVideoAdapter(provider))
            adapter = get_video_adapter("kling")
            create_request = self._kling_create_request(request)
        elif request.provider == "yunwu-kling":
            register_video_adapter(YunwuKlingVideoAdapter(provider))
            adapter = get_video_adapter("yunwu-kling")
            create_request = self._kling_create_request(request)
        elif request.provider == "seedance_official":
            register_video_adapter(SeedanceOfficialVideoAdapter(provider))
            adapter = get_video_adapter("seedance_official")
            create_request = self._seedance_create_request(request)
        elif request.provider == "kie":
            adapter = get_video_adapter("kie")
            create_request = self._kie_create_request(request)
        else:
            raise ValueError(f"Unsupported provider: {request.provider}")

        adapter_result = await adapter.create(create_request, capability)
        now = int(time.time())
        status = self._service_status(adapter_result.status)
        if status not in {"queued", "running"}:
            status = "queued"
        task = VideoTask(
            id=f"video_{uuid.uuid4().hex[:12]}",
            schemaVersion="v2",
            provider=request.provider,
            model=request.model,
            videoMode=request.videoMode,
            status=status,
            progress=self._progress_for_status(status),
            message=adapter_result.message or (
                "Google video task started." if request.provider == "google" else "Video task queued."
            ),
            providerTaskId=adapter_result.task_id,
            outputs={},
            requestSnapshot={},
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
        if task.status in {"success", "cancelled"}:
            return task
        if task.status == "error" and not self._is_recoverable_query_error(task):
            return task

        provider = self.providers.get(task.provider)
        if not provider:
            raise ValueError(f"Unsupported provider: {task.provider}")

        try:
            if task.provider == "kling":
                register_video_adapter(KlingVideoAdapter(provider))
            elif task.provider == "yunwu-kling":
                register_video_adapter(YunwuKlingVideoAdapter(provider))
            elif task.provider == "seedance_official":
                register_video_adapter(SeedanceOfficialVideoAdapter(provider))

            adapter = get_video_adapter(task.provider)
            adapter_result = await adapter.query(
                VideoQueryRequest(
                    provider=task.provider,
                    model=task.model,
                    task_id=task.providerTaskId,
                    project_dir=project_path,
                ),
                self._find_model(task.provider, task.model) or {},
            )
            status = self._service_status(adapter_result.status)
            message = sanitize_task_text(
                adapter_result.message or adapter_result.raw_status or status,
                fallback=status,
            ) or status
            if status == "error":
                label = self._provider_label(task.provider)
                known_prefixes = ("Google:", "Google Cloud:", "Kling:", "Yunwu-Kling:", "Seedance:", "Yunwu:", "KIE:")
                if not message.startswith(known_prefixes):
                    message = sanitize_task_text(f"{label}: {message}", fallback=f"{label}: error") or f"{label}: error"
            remote_url = adapter_result.video_url
            if status == "success" and not remote_url and not adapter_result.video_bytes:
                status = "running"
                message = "Waiting for video URL"

            print(
                f"[VideoGeneration:{self._provider_label(task.provider)} query]",
                {
                    "providerTaskId": task.providerTaskId,
                    "rawStatus": sanitize_task_text(adapter_result.raw_status, fallback="") or "",
                    "mappedStatus": status,
                    "message": message,
                },
            )

            outputs = dict(task.outputs or {})
            patch = {
                "schemaVersion": "v2",
                "status": status,
                "progress": self._progress_for_status(status),
                "message": message,
                "outputs": outputs,
                "updatedAt": int(time.time()),
                "error": message if status == "error" else None,
                "requestSnapshot": {},
            }

            if status == "success" and adapter_result.video_bytes:
                try:
                    save_video_bytes_to_project(project_path, adapter_result.video_bytes, task.id)
                    patch["outputs"] = {
                        **outputs,
                        "video": {"relativePath": video_relative_path(task.id)},
                    }
                    patch["message"] = "Video generation completed."
                except Exception as exc:
                    safe_error = sanitize_task_text(exc, fallback="Video file save failed.") or "Video file save failed."
                    patch["status"] = "error"
                    patch["progress"] = 0
                    patch["error"] = safe_error
                    patch["message"] = sanitize_task_text(
                        f"Video completed, but saving failed: {safe_error}",
                        fallback="Video completed, but saving failed.",
                    )
            elif status == "success" and remote_url:
                try:
                    await download_video_to_project(project_path, remote_url, task.id)
                    patch["outputs"] = {
                        **outputs,
                        "video": {"relativePath": video_relative_path(task.id)},
                    }
                    patch["message"] = "Video generation completed."
                except Exception as exc:
                    patch.update(self._interrupted_patch(task, exc, outputs))

            if patch["status"] == "success" and task.provider == "seedance_official" and adapter_result.last_frame_url:
                last_frame, warning = await self._download_seedance_last_frame(
                    project_path,
                    task.providerTaskId,
                    adapter_result.last_frame_url,
                )
                relative_path = normalize_relative_artifact_path(
                    project_path,
                    (last_frame or {}).get("relativePath")
                    or (last_frame or {}).get("filePath")
                    or (last_frame or {}).get("url"),
                    kind="lastFrame",
                    require_exists=False,
                )
                if relative_path:
                    patch["outputs"] = {
                        **patch["outputs"],
                        "lastFrame": {"relativePath": relative_path},
                    }
                if warning:
                    patch["message"] = "Video generation completed; last frame is unavailable."

            updated = task.model_copy(update=patch)
            await upsert_task(project_path, updated)
            return updated
        except Exception as exc:
            updated = task.model_copy(update=self._interrupted_patch(task, exc))
            await upsert_task(project_path, updated)
            return updated
