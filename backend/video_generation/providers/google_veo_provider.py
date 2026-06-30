import base64
import mimetypes
import os
from pathlib import Path
from urllib.parse import unquote, urlparse

from google import genai
from google.genai import types
from settings_resolver import resolve_provider_secret

from engines.image_utils import decode_base64_payload, infer_mime_type, prepare_provider_image_input
from video_generation.providers.base import BaseVideoProvider
from video_generation.schemas import VideoGenerateRequest


MAX_INPUT_IMAGE_BYTES = 20 * 1024 * 1024
REFERENCE_VIDEO_MODELS = {"veo-3.1-generate-001", "veo-3.1-fast-generate-001"}


class GoogleVeoProvider(BaseVideoProvider):
    def __init__(
        self,
        project: str | None = None,
        location: str | None = None,
        api_key: str | None = None,
    ):
        self.project = (
            project
            or os.getenv("GOOGLE_CLOUD_PROJECT")
            or os.getenv("GOOGLE_PROJECT_ID")
            or os.getenv("GOOGLE_PROJECT")
        )
        self.location = (
            location
            or os.getenv("GOOGLE_CLOUD_LOCATION")
            or os.getenv("GOOGLE_LOCATION")
            or "us-central1"
        )
        self.api_key = api_key
        self.client = None
        self._client_api_key = None

    def _client(self):
        if not self.project or not self.location:
            raise ValueError("Google credentials/project/location not configured: GOOGLE_CLOUD_PROJECT is missing")
        api_key = self.api_key or resolve_provider_secret("google", "apiKey", "GOOGLE_CLOUD_API_KEY")
        if not api_key:
            raise ValueError("Google credentials/project/location not configured: GOOGLE_CLOUD_API_KEY is missing")
        if self.client is not None and self._client_api_key is None:
            return self.client
        if self.client is None or self._client_api_key != api_key:
            self.client = genai.Client(
                vertexai=True,
                api_key=api_key,
                project=self.project,
                location=self.location,
            )
            self._client_api_key = api_key
        return self.client

    def _serialize(self, value):
        if value is None:
            return None
        if isinstance(value, bytes):
            return f"<bytes {len(value)}>"
        if isinstance(value, (str, int, float, bool)):
            return value
        if isinstance(value, list):
            return [self._serialize(item) for item in value]
        if isinstance(value, tuple):
            return [self._serialize(item) for item in value]
        if isinstance(value, dict):
            return {key: self._serialize(item) for key, item in value.items()}
        if hasattr(value, "model_dump"):
            return self._serialize(value.model_dump(mode="python", exclude_none=True))
        return str(value)

    def _parse_duration_seconds(self, request: VideoGenerateRequest) -> int:
        raw = request.durationSeconds
        if raw is None and request.duration:
            try:
                raw = int(str(request.duration).lower().replace("s", ""))
            except ValueError:
                raw = None
        duration = raw if raw in {4, 6, 8} else 8
        if request.resolution == "1080p" or request.videoMode == "reference-video":
            return 8
        return duration

    def _number_of_videos(self, request: VideoGenerateRequest) -> int:
        number = request.numberOfVideos or 1
        return max(1, min(int(number), 4))

    def _local_proxy_path(self, project_path: str | None, value: str) -> str | None:
        if not project_path:
            return None

        parsed = urlparse(value)
        raw_path = unquote(parsed.path or value)
        parts = [part for part in raw_path.replace("\\", "/").split("/") if part]
        filename = os.path.basename(raw_path)
        if not filename:
            return None

        project = Path(project_path)
        if len(parts) >= 3 and parts[-3] == "api" and parts[-2] == "input":
            candidate = project / "input" / filename
        elif len(parts) >= 3 and parts[-3] == "api" and parts[-2] in {"image", "generated"}:
            candidate = project / "generation" / filename
        elif len(parts) >= 2 and parts[-2] == "input":
            candidate = project / "input" / filename
        elif len(parts) >= 2 and parts[-2] == "generation":
            candidate = project / "generation" / filename
        else:
            candidate = None

        if candidate and candidate.exists():
            return str(candidate)
        return None

    async def _image_for_google(self, project_path: str | None, value: str) -> types.Image:
        if value.startswith("data:image/"):
            header = value.split(",", 1)[0]
            mime_type = header.split(":", 1)[1].split(";", 1)[0] if ":" in header else "image/png"
            image_bytes = decode_base64_payload(value)
        else:
            local_path = self._local_proxy_path(project_path, value)
            prepared = await prepare_provider_image_input(
                local_path or value,
                str(Path(project_path) / "generation") if project_path else None,
                prefer="base64",
            )
            if not prepared.raw_data:
                raise ValueError(f"Unable to read Google Veo image input: {value}")
            image_bytes = prepared.raw_data
            mime_type = prepared.mime_type or mimetypes.guess_type(prepared.filename or "")[0] or infer_mime_type(image_bytes)

        if len(image_bytes) > MAX_INPUT_IMAGE_BYTES:
            raise ValueError("Google Veo input image exceeds 20MB limit")
        return types.Image(imageBytes=image_bytes, mimeType=mime_type or "image/png")

    async def _build_source_and_config(self, request: VideoGenerateRequest):
        aspect_ratio = request.aspectRatio if request.aspectRatio in {"16:9", "9:16"} else "16:9"
        resolution = request.resolution if request.resolution in {"720p", "1080p"} else "720p"
        seed = request.seed if request.seed is not None and request.seed >= 0 else None
        person_generation = "allow_all" if request.videoMode == "text-to-video" else "allow_adult"

        source_kwargs = {"prompt": request.prompt}
        config_kwargs = {
            "aspectRatio": aspect_ratio,
            "numberOfVideos": self._number_of_videos(request),
            "durationSeconds": self._parse_duration_seconds(request),
            "personGeneration": person_generation,
            "generateAudio": bool(request.generateAudio),
            "resolution": resolution,
            "seed": seed,
        }
        if request.negativePrompt:
            config_kwargs["negativePrompt"] = request.negativePrompt

        if request.videoMode == "image-to-video":
            if not request.images:
                raise ValueError("image-to-video requires a start image")
            source_kwargs["image"] = await self._image_for_google(request.projectPath, request.images[0])
            if request.endImage:
                config_kwargs["lastFrame"] = await self._image_for_google(request.projectPath, request.endImage)
        elif request.videoMode == "reference-video":
            if request.model not in REFERENCE_VIDEO_MODELS:
                raise ValueError("Google Veo reference-video is not supported by this model")
            if not request.images:
                raise ValueError("reference-video requires at least one reference image")
            references = []
            for image in request.images[:4]:
                references.append(
                    types.VideoGenerationReferenceImage(
                        image=await self._image_for_google(request.projectPath, image),
                        referenceType=types.VideoGenerationReferenceType.ASSET,
                    )
                )
            config_kwargs["referenceImages"] = references
        elif request.videoMode != "text-to-video":
            raise ValueError(f"Unsupported video mode: {request.videoMode}")

        return types.GenerateVideosSource(**source_kwargs), types.GenerateVideosConfig(**config_kwargs)

    async def build_create_payload(self, request: VideoGenerateRequest) -> dict:
        source, config = await self._build_source_and_config(request)
        return {
            "source": source,
            "config": config,
        }

    async def create_task(self, request: VideoGenerateRequest) -> dict:
        payload = await self.build_create_payload(request)
        operation = self._client().models.generate_videos(
            model=request.model,
            source=payload["source"],
            config=payload["config"],
        )
        return {
            "providerTaskId": operation.name,
            "status": "running" if not operation.done else "success",
            "raw": self._serialize(operation),
        }

    async def query_task(self, provider_task_id: str) -> dict:
        operation = types.GenerateVideosOperation(name=provider_task_id)
        operation = self._client().operations.get(operation)
        raw = self._serialize(operation)

        if not operation.done:
            return {"status": "running", "raw": raw}

        if operation.error:
            return {
                "status": "error",
                "message": self._serialize(operation.error),
                "raw": raw,
            }

        result = operation.result or operation.response
        if not result:
            return {
                "status": "error",
                "message": "Google: operation completed without a response",
                "raw": raw,
            }

        generated_videos = getattr(result, "generated_videos", None) or []
        if not generated_videos:
            return {
                "status": "error",
                "message": "Google: operation completed without generated videos",
                "raw": raw,
            }

        video = getattr(generated_videos[0], "video", None)
        if not video:
            return {
                "status": "error",
                "message": "Google: generated video payload is missing",
                "raw": raw,
            }

        uri = getattr(video, "uri", None)
        video_bytes = getattr(video, "video_bytes", None)
        if isinstance(video_bytes, str):
            video_bytes = base64.b64decode(video_bytes)

        return {
            "status": "success",
            "remoteVideoUrl": uri,
            "videoBytes": video_bytes,
            "raw": raw,
        }
