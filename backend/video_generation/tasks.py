import asyncio
import json
import os
import re
from pathlib import Path, PurePosixPath
from typing import Any
from urllib.parse import urlsplit

from video_generation.schemas import TASK_SCHEMA_VERSION, VideoTask, sanitize_task_text
from video_generation.storage import video_api_url


_LOCKS: dict[str, asyncio.Lock] = {}
_DRIVE_PATTERN = re.compile(r"^[A-Za-z]:")
_ALLOWED_ROOTS = {
    "video": ("generation", "videos"),
    "lastFrame": ("generation",),
}


def _project_key(project_path: str) -> str:
    return str(Path(project_path).resolve())


def _project_lock(project_path: str) -> asyncio.Lock:
    key = _project_key(project_path)
    if key not in _LOCKS:
        _LOCKS[key] = asyncio.Lock()
    return _LOCKS[key]


def ensure_tasks_dir(project_path: str) -> str:
    tasks_dir = os.path.join(project_path, "tasks")
    os.makedirs(tasks_dir, exist_ok=True)
    return tasks_dir


def _tasks_file(project_path: str) -> str:
    return os.path.join(project_path, "tasks", "video_tasks.json")


def _read_tasks(project_path: str) -> dict[str, Any]:
    path = _tasks_file(project_path)
    if not os.path.exists(path):
        return {}
    with open(path, "r", encoding="utf-8") as file:
        try:
            data = json.load(file)
        except json.JSONDecodeError:
            return {}
    return data if isinstance(data, dict) else {}


def _write_tasks(project_path: str, tasks: dict[str, Any]) -> None:
    path = _tasks_file(project_path)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp_path = f"{path}.tmp"
    with open(tmp_path, "w", encoding="utf-8") as file:
        json.dump(tasks, file, indent=2, ensure_ascii=False)
    os.replace(tmp_path, path)


def normalize_relative_artifact_path(
    project_path: str,
    value: Any,
    *,
    kind: str,
    require_exists: bool = True,
) -> str | None:
    if not isinstance(value, str):
        return None
    raw = value.strip().replace("\\", "/")
    if not raw or _DRIVE_PATTERN.match(raw) or raw.startswith(("/", "//")):
        return None
    parsed = urlsplit(raw)
    if parsed.scheme or parsed.netloc or parsed.query or parsed.fragment:
        return None
    pure = PurePosixPath(parsed.path)
    if pure.is_absolute() or not pure.parts or any(part in {"", ".", ".."} for part in pure.parts):
        return None
    allowed_root = _ALLOWED_ROOTS.get(kind)
    if not allowed_root or tuple(pure.parts[: len(allowed_root)]) != allowed_root:
        return None

    project_root = Path(project_path).resolve()
    target = (project_root / Path(*pure.parts)).resolve()
    if project_root != target and project_root not in target.parents:
        return None
    if require_exists and (not target.is_file()):
        return None
    return pure.as_posix()


def _legacy_artifact_value(task: dict[str, Any], kind: str) -> Any:
    outputs = task.get("outputs") if isinstance(task.get("outputs"), dict) else {}
    artifact = outputs.get(kind)
    if isinstance(artifact, dict):
        return artifact.get("relativePath") or artifact.get("filePath") or artifact.get("path") or artifact.get("url")
    if kind == "video":
        return artifact or outputs.get("videoPath") or outputs.get("videoUrl") or task.get("localVideoUrl")
    return artifact or outputs.get("lastFramePath") or outputs.get("lastFrameUrl")


def _canonical_outputs(project_path: str, task: dict[str, Any], *, require_exists: bool) -> dict[str, Any]:
    outputs: dict[str, Any] = {}
    video_path = normalize_relative_artifact_path(
        project_path,
        _legacy_artifact_value(task, "video"),
        kind="video",
        require_exists=require_exists,
    )
    if video_path:
        outputs["video"] = {"relativePath": video_path}
    last_frame_path = normalize_relative_artifact_path(
        project_path,
        _legacy_artifact_value(task, "lastFrame"),
        kind="lastFrame",
        require_exists=require_exists,
    )
    if last_frame_path:
        outputs["lastFrame"] = {"relativePath": last_frame_path}
    return outputs


def canonicalize_task_record(project_path: str, record: dict[str, Any], task_id: str | None = None) -> VideoTask:
    source = record if isinstance(record, dict) else {}
    outputs = _canonical_outputs(project_path, source, require_exists=True)
    status = str(source.get("status") or "error")
    provider_task_id = str(source.get("providerTaskId") or "")
    message = sanitize_task_text(source.get("message"), fallback="") or ""
    error = sanitize_task_text(source.get("error"))

    if status == "success" and "video" not in outputs:
        if provider_task_id:
            status = "interrupted"
            message = "Stored video asset is unavailable. Query the provider again or regenerate."
            error = None
        else:
            status = "error"
            message = "Stored video asset is unavailable. Please regenerate."
            error = message

    request = source.get("request") if isinstance(source.get("request"), dict) else {}
    video_mode = str(source.get("videoMode") or source.get("taskType") or request.get("videoMode") or "text-to-video")
    return VideoTask(
        id=str(source.get("id") or task_id or ""),
        schemaVersion=TASK_SCHEMA_VERSION,
        provider=str(source.get("provider") or ""),
        model=str(source.get("model") or ""),
        videoMode=video_mode,
        status=status,
        progress=max(0, min(int(source.get("progress") or 0), 100)),
        queuePosition=source.get("queuePosition") if isinstance(source.get("queuePosition"), int) else None,
        message=message,
        providerTaskId=provider_task_id,
        outputs=outputs,
        requestSnapshot={},
        createdAt=int(source.get("createdAt") or 0),
        updatedAt=int(source.get("updatedAt") or source.get("createdAt") or 0),
        error=error,
    )


def task_storage_record(project_path: str, task: VideoTask) -> dict[str, Any]:
    canonical = canonicalize_task_record(project_path, task.model_dump(), task.id)
    data = canonical.model_dump(exclude_none=True)
    if not data.get("requestSnapshot"):
        data.pop("requestSnapshot", None)
    if not data.get("message"):
        data.pop("message", None)
    if not data.get("outputs"):
        data["outputs"] = {}
    return data


def task_api_data(task: VideoTask) -> dict[str, Any]:
    data = task.model_dump(exclude_none=True)
    if not data.get("requestSnapshot"):
        data.pop("requestSnapshot", None)
    outputs = dict(data.get("outputs") or {})
    video = outputs.get("video") if isinstance(outputs.get("video"), dict) else None
    video_path = video.get("relativePath") if video else None
    if video_path:
        video_url = video_api_url(video_path)
        outputs["videoUrl"] = video_url
        data["localVideoUrl"] = video_url
    last_frame = outputs.get("lastFrame") if isinstance(outputs.get("lastFrame"), dict) else None
    last_frame_path = last_frame.get("relativePath") if last_frame else None
    if last_frame_path:
        outputs["lastFrame"] = {
            **last_frame,
            "url": last_frame_path,
            "filePath": last_frame_path,
        }
    data["outputs"] = outputs
    return data


async def load_tasks(project_path: str) -> dict[str, Any]:
    async with _project_lock(project_path):
        tasks = _read_tasks(project_path)
    return {
        task_id: canonicalize_task_record(project_path, record, task_id).model_dump(exclude_none=True)
        for task_id, record in tasks.items()
        if isinstance(record, dict)
    }


async def save_tasks(project_path: str, tasks: dict[str, Any]) -> None:
    records: dict[str, Any] = {}
    for task_id, value in tasks.items():
        task = value if isinstance(value, VideoTask) else VideoTask(**value)
        if task.schemaVersion != TASK_SCHEMA_VERSION:
            raise ValueError("save_tasks accepts canonical v2 tasks only")
        records[task_id] = task_storage_record(project_path, task)
    async with _project_lock(project_path):
        _write_tasks(project_path, records)


async def get_task(project_path: str, task_id: str) -> VideoTask | None:
    async with _project_lock(project_path):
        task = _read_tasks(project_path).get(task_id)
    return canonicalize_task_record(project_path, task, task_id) if isinstance(task, dict) else None


async def upsert_task(project_path: str, task: VideoTask) -> VideoTask:
    async with _project_lock(project_path):
        tasks = _read_tasks(project_path)
        tasks[task.id] = task_storage_record(project_path, task)
        _write_tasks(project_path, tasks)
    return canonicalize_task_record(project_path, tasks[task.id], task.id)


async def update_task(project_path: str, task_id: str, patch: dict[str, Any]) -> VideoTask | None:
    async with _project_lock(project_path):
        tasks = _read_tasks(project_path)
        stored = tasks.get(task_id)
        if not isinstance(stored, dict):
            return None
        task = canonicalize_task_record(project_path, stored, task_id)
        updated = task.model_copy(update=patch)
        tasks[task_id] = task_storage_record(project_path, updated)
        _write_tasks(project_path, tasks)
    return canonicalize_task_record(project_path, tasks[task_id], task_id)
