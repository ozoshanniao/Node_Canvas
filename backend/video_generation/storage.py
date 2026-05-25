import os
from urllib.parse import urlparse

import httpx


def ensure_video_dir(project_path: str) -> str:
    video_dir = os.path.join(project_path, "generation", "videos")
    os.makedirs(video_dir, exist_ok=True)
    return video_dir


def _safe_video_filename(task_id: str) -> str:
    safe_id = "".join(ch for ch in task_id if ch.isalnum() or ch in {"-", "_"})
    if not safe_id:
        raise ValueError("Invalid task id for video filename")
    return f"{safe_id}.mp4"


def save_video_bytes_to_project(project_path: str, video_bytes: bytes, task_id: str) -> str:
    if not video_bytes:
        raise ValueError("video_bytes is empty")

    video_dir = ensure_video_dir(project_path)
    filename = _safe_video_filename(task_id)
    file_path = os.path.join(video_dir, filename)
    tmp_path = f"{file_path}.tmp"

    with open(tmp_path, "wb") as file:
        file.write(video_bytes)

    if os.path.getsize(tmp_path) <= 0:
        raise ValueError("Saved video is empty")

    os.replace(tmp_path, file_path)
    return f"/api/video/{filename}"


async def download_video_to_project(project_path: str, remote_url: str, task_id: str) -> str:
    parsed = urlparse(remote_url or "")
    if parsed.scheme not in {"http", "https"}:
        raise ValueError("remote_url must be an http(s) URL")

    video_dir = ensure_video_dir(project_path)
    filename = _safe_video_filename(task_id)
    file_path = os.path.join(video_dir, filename)
    tmp_path = f"{file_path}.tmp"

    timeout = httpx.Timeout(connect=15.0, read=180.0, write=30.0, pool=30.0)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        async with client.stream("GET", remote_url) as response:
            response.raise_for_status()
            with open(tmp_path, "wb") as file:
                async for chunk in response.aiter_bytes():
                    if chunk:
                        file.write(chunk)

    if os.path.getsize(tmp_path) <= 0:
        raise ValueError("Downloaded video is empty")

    os.replace(tmp_path, file_path)
    return f"/api/video/{filename}"
