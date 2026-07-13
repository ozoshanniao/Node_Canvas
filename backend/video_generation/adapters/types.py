from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal


VideoAdapterStatus = Literal["queued", "running", "succeeded", "failed", "canceled", "unknown"]
VideoInputKind = Literal["text", "image", "video", "audio", "element"]


@dataclass(frozen=True)
class VideoInputAsset:
    kind: VideoInputKind
    role: str
    url: str | None = None
    path: str | None = None
    mime_type: str | None = None
    handle_id: str | None = None
    label: str | None = None


@dataclass(frozen=True)
class VideoCreateRequest:
    provider: str
    model: str
    task_type: str
    prompt: str
    params: dict[str, Any] = field(default_factory=dict)
    inputs: dict[str, list[VideoInputAsset]] = field(default_factory=dict)
    project_dir: str | None = None


@dataclass(frozen=True)
class VideoQueryRequest:
    provider: str
    model: str
    task_id: str
    params: dict[str, Any] = field(default_factory=dict)
    project_dir: str | None = None


@dataclass(frozen=True)
class VideoCreateResult:
    provider: str
    model: str
    task_id: str
    status: VideoAdapterStatus
    raw_status: str | None = None
    message: str | None = None
    created_at: int | None = None
    raw_response: dict[str, Any] | None = None
    video_bytes: bytes | None = None
    video_url: str | None = None
    video_mime_type: str | None = None
    diagnostics: Any | None = None


@dataclass(frozen=True)
class VideoQueryResult:
    provider: str
    model: str
    task_id: str
    status: VideoAdapterStatus
    video_url: str | None = None
    video_path: str | None = None
    last_frame_url: str | None = None
    last_frame_path: str | None = None
    message: str | None = None
    raw_status: str | None = None
    completed_at: int | None = None
    raw_response: dict[str, Any] | None = None
    video_bytes: bytes | None = None


STATUS_MAP: dict[str, VideoAdapterStatus] = {
    "pending": "queued",
    "queued": "queued",
    "submitted": "queued",
    "processing": "running",
    "running": "running",
    "generating": "running",
    "image_downloading": "running",
    "video_generating": "running",
    "video_generation_completed": "running",
    "video_upsampling": "running",
    "video_upsampling_completed": "running",
    "success": "succeeded",
    "succeeded": "succeeded",
    "completed": "succeeded",
    "done": "succeeded",
    "failed": "failed",
    "error": "failed",
    "video_generation_failed": "failed",
    "video_upsampling_failed": "failed",
    "canceled": "canceled",
    "cancelled": "canceled",
}


def normalize_video_adapter_status(raw_status: str | None) -> VideoAdapterStatus:
    if not raw_status:
        return "unknown"
    return STATUS_MAP.get(str(raw_status).strip().lower(), "unknown")
