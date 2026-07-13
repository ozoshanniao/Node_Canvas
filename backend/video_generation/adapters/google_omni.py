from __future__ import annotations

import asyncio
import base64
import binascii
import mimetypes
import re
from pathlib import Path
from typing import Any, Mapping
from urllib.parse import unquote, urlparse

from google.genai import interactions

from video_generation.adapters.types import (
    VideoCreateRequest,
    VideoCreateResult,
    VideoInputAsset,
    VideoQueryRequest,
    VideoQueryResult,
)
from video_generation.providers.google_omni_provider import (
    SAFE_FAILURE_MESSAGE,
    VideoCreateDiagnostics,
    GoogleOmniCreateError,
    GoogleOmniProvider,
    classify_google_omni_exception,
)
from video_generation.schemas import VideoGenerateRequest


MAX_INPUT_IMAGE_BYTES = 20 * 1024 * 1024
MODEL_ID = "gemini-omni-flash-preview"
MODE_TO_TASK = {
    "text-to-video": "text_to_video",
    "image-to-video": "image_to_video",
    "reference-video": "reference_to_video",
}
ALLOWED_IMAGE_MIME_TYPES = {
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
    "image/bmp",
    "image/tiff",
}
GENERIC_IMAGE_TOKEN = re.compile(
    r"<<<image_(\d+)>>>|@image_?(\d+)(?![\w])",
    re.IGNORECASE,
)
OMNI_DURATION_PATTERN = re.compile(r"^(?:[3-9]|10)s$")
DURATION_GUIDANCE_SUFFIX = re.compile(
    r"(?:(?:\r?\n){2}Generate a single video approximately \d+(?:\.\d+)? seconds long\.)+\s*$"
)


class GoogleOmniVideoAdapter:
    provider = "google_omni"
    adapter_id = "google:omni"

    def __init__(self, omni_provider: GoogleOmniProvider | None = None):
        self.omni_provider = omni_provider or GoogleOmniProvider()

    def supports(self, capability: Mapping[str, Any]) -> bool:
        hints = capability.get("adapterHints") if isinstance(capability.get("adapterHints"), Mapping) else {}
        return capability.get("provider") == self.provider or hints.get("adapterId") == self.adapter_id

    def create_request_from_generate_request(self, request: VideoGenerateRequest) -> VideoCreateRequest:
        inputs: dict[str, list[VideoInputAsset]] = {}
        if request.videoMode == "image-to-video":
            inputs["image:firstFrame"] = [
                VideoInputAsset(
                    kind="image",
                    role="first_frame",
                    url=request.images[0],
                    handle_id="image:firstFrame",
                )
            ]
        elif request.videoMode == "reference-video":
            inputs["image:references"] = [
                VideoInputAsset(
                    kind="image",
                    role="reference",
                    url=image,
                    handle_id="image:references",
                )
                for image in request.images
            ]
        return VideoCreateRequest(
            provider=request.provider,
            model=request.model,
            task_type=request.videoMode,
            prompt=request.prompt,
            params={"aspectRatio": request.aspectRatio, "duration": request.duration},
            inputs=inputs,
            project_dir=request.projectPath,
        )

    def build_create_payload(
        self,
        request: VideoCreateRequest,
        capability: Mapping[str, Any],
    ) -> interactions.CreateModelInteraction:
        del capability
        if request.model != MODEL_ID:
            raise ValueError(f"Unsupported Google Omni model: {request.model}")
        task = MODE_TO_TASK.get(request.task_type)
        if not task:
            raise ValueError(f"Unsupported Google Omni task: {request.task_type}")
        aspect_ratio = request.params.get("aspectRatio")
        if aspect_ratio not in {"16:9", "9:16"}:
            raise ValueError("Google Omni aspectRatio must be 16:9 or 9:16")

        duration_seconds = self._duration_seconds(request.params.get("duration"))
        assets = self._assets_for_task(request)
        prompt, role_tokens = self._normalize_prompt(request.prompt, request.task_type, len(assets))
        prompt = self._append_duration_guidance(prompt, duration_seconds)
        content: list[Any] = [interactions.TextContent(text=prompt)]
        for asset in assets:
            image_bytes, mime_type = self._read_image(asset, request.project_dir)
            content.append(interactions.ImageContent(
                data=base64.b64encode(image_bytes).decode("ascii"),
                mime_type=mime_type,
            ))

        if role_tokens and any(token not in prompt for token in role_tokens):
            raise ValueError("Google Omni prompt role normalization failed")
        return interactions.CreateModelInteraction(
            model=MODEL_ID,
            input=content,
            generation_config=interactions.GenerationConfig(
                video_config=interactions.VideoConfig(task=task),
            ),
            response_format=interactions.VideoResponseFormat(
                type="video",
                aspect_ratio=aspect_ratio,
                delivery="inline",
            ),
            background=False,
            store=False,
            stream=False,
        )

    async def create(
        self,
        request: VideoCreateRequest,
        capability: Mapping[str, Any],
    ) -> VideoCreateResult:
        payload = self.build_create_payload(request, capability)
        try:
            interaction = await asyncio.to_thread(self.omni_provider.create_interaction, payload)
        except GoogleOmniCreateError as exc:
            return self._failed_result(request, diagnostics=exc.diagnostics)
        except Exception as exc:
            return self._failed_result(
                request,
                diagnostics=classify_google_omni_exception(exc),
            )

        raw_status = str(getattr(interaction, "status", "") or "").strip().lower()
        completed = raw_status == "completed"
        video_bytes, mime_type, video_url = self._extract_video(interaction)
        diagnostics = self._interaction_diagnostics(
            interaction,
            completed=completed,
            video_bytes_present=video_bytes is not None,
            video_url=video_url,
        )
        if raw_status == "cancelled":
            return VideoCreateResult(
                provider=self.provider,
                model=request.model,
                task_id="",
                status="canceled",
                raw_status=raw_status,
                message="Google Omni generation was cancelled.",
                diagnostics=VideoCreateDiagnostics(
                    **{**diagnostics.__dict__, "error_category": "interaction_not_completed"}
                ),
            )
        if not completed:
            return self._failed_result(
                request,
                raw_status=raw_status or None,
                diagnostics=VideoCreateDiagnostics(
                    **{**diagnostics.__dict__, "error_category": "interaction_not_completed"}
                ),
            )

        if video_bytes is None and video_url is None:
            return self._failed_result(
                request,
                raw_status=raw_status,
                diagnostics=VideoCreateDiagnostics(
                    **{**diagnostics.__dict__, "error_category": "output_missing"}
                ),
            )
        return VideoCreateResult(
            provider=self.provider,
            model=request.model,
            task_id="",
            status="succeeded",
            raw_status=raw_status,
            message="Google Omni generation completed.",
            video_bytes=video_bytes,
            video_url=video_url,
            video_mime_type=mime_type,
            diagnostics=diagnostics,
        )

    async def query(
        self,
        request: VideoQueryRequest,
        capability: Mapping[str, Any],
    ) -> VideoQueryResult:
        del request, capability
        raise ValueError("Google Omni is synchronous and does not support task queries")

    def _assets_for_task(self, request: VideoCreateRequest) -> list[VideoInputAsset]:
        first_frames = list(request.inputs.get("image:firstFrame") or [])
        references = list(request.inputs.get("image:references") or [])
        unexpected = set(request.inputs) - {"image:firstFrame", "image:references"}
        if unexpected:
            raise ValueError("Google Omni received unsupported media inputs")
        if request.task_type == "text-to-video":
            if first_frames or references:
                raise ValueError("Google Omni text-to-video does not accept images")
            return []
        if request.task_type == "image-to-video":
            if len(first_frames) != 1 or references:
                raise ValueError("Google Omni image-to-video requires exactly one first-frame image")
            return first_frames
        if request.task_type == "reference-video":
            if first_frames or not 1 <= len(references) <= 10:
                raise ValueError("Google Omni reference-video requires between 1 and 10 reference images")
            return references
        raise ValueError(f"Unsupported Google Omni task: {request.task_type}")

    def _normalize_prompt(self, prompt: str, task_type: str, image_count: int) -> tuple[str, list[str]]:
        text = str(prompt or "").strip()
        if not text:
            raise ValueError("Google Omni prompt is required")
        if task_type == "image-to-video":
            role_tokens = ["<FIRST_FRAME>"]
        elif task_type == "reference-video":
            role_tokens = [f"<IMAGE_REF_{index}>" for index in range(image_count)]
        else:
            role_tokens = []

        def replace(match: re.Match[str]) -> str:
            index = int(match.group(1) or match.group(2))
            if index < 1 or index > image_count:
                raise ValueError(f"Unknown Google Omni image reference: @image_{index}")
            return role_tokens[index - 1]

        text = GENERIC_IMAGE_TOKEN.sub(replace, text)
        missing = [token for token in role_tokens if token not in text]
        if missing:
            text = f"{' '.join(missing)}\n{text}"
        if GENERIC_IMAGE_TOKEN.search(text):
            raise ValueError("Google Omni prompt contains unresolved image references")
        return text, role_tokens

    def _duration_seconds(self, value: Any) -> int:
        duration = str(value or "").strip()
        if not OMNI_DURATION_PATTERN.fullmatch(duration):
            raise ValueError("Google Omni duration must be an integer from 3s to 10s")
        return int(duration[:-1])

    def _append_duration_guidance(self, prompt: str, duration_seconds: int) -> str:
        base_prompt = DURATION_GUIDANCE_SUFFIX.sub("", prompt).rstrip()
        return (
            f"{base_prompt}\n\n"
            f"Generate a single video approximately {duration_seconds} seconds long."
        )

    def _read_image(self, asset: VideoInputAsset, project_dir: str | None) -> tuple[bytes, str]:
        value = str(asset.path or asset.url or "").strip()
        if not value:
            raise ValueError("Google Omni image input is empty")
        if value.lower().startswith("data:image/"):
            image_bytes, mime_type = self._decode_data_image(value)
        else:
            path = self._resolve_project_image(value, project_dir)
            image_bytes = path.read_bytes()
            mime_type = asset.mime_type or mimetypes.guess_type(path.name)[0] or self._infer_image_mime(image_bytes)
        if not image_bytes:
            raise ValueError("Google Omni image input is empty")
        if len(image_bytes) > MAX_INPUT_IMAGE_BYTES:
            raise ValueError("Google Omni input image exceeds 20MB limit")
        detected = self._infer_image_mime(image_bytes)
        if mime_type not in ALLOWED_IMAGE_MIME_TYPES or detected not in ALLOWED_IMAGE_MIME_TYPES:
            raise ValueError("Google Omni input is not a supported image")
        if mime_type != detected:
            raise ValueError("Google Omni image MIME type does not match its content")
        return image_bytes, detected

    def _decode_data_image(self, value: str) -> tuple[bytes, str]:
        try:
            header, encoded = value.split(",", 1)
            mime_type = header[5:].split(";", 1)[0].lower()
            if ";base64" not in header.lower():
                raise ValueError("Google Omni data image must be base64 encoded")
            return base64.b64decode(encoded, validate=True), mime_type
        except (ValueError, binascii.Error) as exc:
            raise ValueError("Invalid Google Omni data image") from exc

    def _resolve_project_image(self, value: str, project_dir: str | None) -> Path:
        if not project_dir:
            raise ValueError("Google Omni local images require projectPath")
        project_root = Path(project_dir).resolve()
        parsed = urlparse(value)
        if parsed.scheme in {"http", "https"}:
            if (parsed.hostname or "").lower() not in {"127.0.0.1", "localhost", "::1"}:
                raise ValueError("Google Omni does not accept remote image URLs")
            parts = [part for part in unquote(parsed.path).replace("\\", "/").split("/") if part]
            filename = Path(parts[-1]).name if parts else ""
            if len(parts) >= 3 and parts[-3] == "api" and parts[-2] == "input":
                candidate = project_root / "input" / filename
            elif len(parts) >= 3 and parts[-3] == "api" and parts[-2] in {"image", "generated"}:
                candidate = project_root / "generation" / filename
            else:
                raise ValueError("Unsupported Google Omni local media URL")
        elif parsed.scheme:
            raise ValueError("Google Omni does not accept non-local image URIs")
        else:
            candidate = Path(value)
            if not candidate.is_absolute():
                candidate = project_root / candidate
        resolved = candidate.resolve()
        try:
            resolved.relative_to(project_root)
        except ValueError as exc:
            raise ValueError("Google Omni image path is outside the project workspace") from exc
        if not resolved.is_file():
            raise ValueError("Google Omni image file does not exist")
        return resolved

    def _infer_image_mime(self, data: bytes) -> str | None:
        if data.startswith(b"\x89PNG\r\n\x1a\n"):
            return "image/png"
        if data.startswith(b"\xff\xd8\xff"):
            return "image/jpeg"
        if data.startswith((b"GIF87a", b"GIF89a")):
            return "image/gif"
        if data.startswith(b"BM"):
            return "image/bmp"
        if data.startswith((b"II*\x00", b"MM\x00*")):
            return "image/tiff"
        if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
            return "image/webp"
        return None

    def _interaction_diagnostics(
        self,
        interaction: Any,
        *,
        completed: bool,
        video_bytes_present: bool,
        video_url: str | None,
    ) -> VideoCreateDiagnostics:
        candidates = [getattr(interaction, "output_video", None), *list(self._step_videos(interaction))]
        video_output_present = any(video is not None for video in candidates)
        uri_scheme_class = "https" if video_url else "none"
        if uri_scheme_class == "none":
            for video in candidates:
                uri = getattr(video, "uri", None) if video is not None else None
                if uri:
                    uri_scheme_class = "other"
                    break
        provider_diagnostics = getattr(self.omni_provider, "last_diagnostics", None)
        base = provider_diagnostics.__dict__ if isinstance(provider_diagnostics, VideoCreateDiagnostics) else {}
        return VideoCreateDiagnostics(
            **{
                **base,
                "response_received": True,
                "provider_response_received": True,
                "interaction_completed": completed,
                "video_output_present": video_output_present,
                "video_bytes_present": video_bytes_present,
                "uri_scheme_class": uri_scheme_class,
            }
        )

    def _extract_video(self, interaction: Any) -> tuple[bytes | None, str | None, str | None]:
        output_video = getattr(interaction, "output_video", None)
        step_videos = list(self._step_videos(interaction))
        for video in [output_video, *step_videos]:
            data = getattr(video, "data", None) if video is not None else None
            if data:
                try:
                    decoded = base64.b64decode(data, validate=True)
                except (ValueError, binascii.Error, TypeError):
                    continue
                if decoded:
                    return decoded, getattr(video, "mime_type", None) or "video/mp4", None
        for video in [output_video, *step_videos]:
            uri = str(getattr(video, "uri", "") or "").strip() if video is not None else ""
            parsed = urlparse(uri)
            if uri and parsed.scheme == "https" and parsed.hostname:
                return None, getattr(video, "mime_type", None) or "video/mp4", uri
        return None, None, None

    def _step_videos(self, interaction: Any):
        for step in reversed(list(getattr(interaction, "steps", None) or [])):
            if getattr(step, "type", None) != "model_output":
                continue
            for content in reversed(list(getattr(step, "content", None) or [])):
                if getattr(content, "type", None) == "video":
                    yield content

    def _failed_result(
        self,
        request: VideoCreateRequest,
        *,
        raw_status: str | None = None,
        diagnostics: VideoCreateDiagnostics | None = None,
    ) -> VideoCreateResult:
        return VideoCreateResult(
            provider=self.provider,
            model=request.model,
            task_id="",
            status="failed",
            raw_status=raw_status,
            message=SAFE_FAILURE_MESSAGE,
            diagnostics=diagnostics or VideoCreateDiagnostics(error_category="unknown"),
        )
