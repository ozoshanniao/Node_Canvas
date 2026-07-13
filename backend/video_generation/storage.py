import os
from urllib.parse import urljoin, urlparse

import httpx


MAX_VIDEO_BYTES = 1024 * 1024 * 1024
MAX_VIDEO_REDIRECTS = 3
_SYNC_VIDEO_CONTENT_TYPES = {"video/mp4", "application/octet-stream", "binary/octet-stream"}


def ensure_video_dir(project_path: str) -> str:
    video_dir = os.path.join(project_path, "generation", "videos")
    os.makedirs(video_dir, exist_ok=True)
    return video_dir


def _safe_video_filename(task_id: str) -> str:
    safe_id = "".join(ch for ch in task_id if ch.isalnum() or ch in {"-", "_"})
    if not safe_id:
        raise ValueError("Invalid task id for video filename")
    return f"{safe_id}.mp4"



def video_relative_path(task_id: str) -> str:
    return f"generation/videos/{_safe_video_filename(task_id)}"


def video_api_url(relative_path: str) -> str:
    parsed = urlparse(relative_path or "")
    if parsed.scheme or parsed.netloc or parsed.query or parsed.fragment:
        raise ValueError("Invalid video relative path")
    normalized = str(relative_path or "").replace("\\", "/")
    prefix = "generation/videos/"
    if not normalized.startswith(prefix) or "/" in normalized[len(prefix):] or ".." in normalized:
        raise ValueError("Invalid video relative path")
    return f"/api/video/{normalized[len(prefix):]}"


def _validate_video_file(file_path: str, *, validate_mp4: bool) -> None:
    size = os.path.getsize(file_path)
    if size <= 0:
        raise ValueError("Saved video is empty")
    if validate_mp4:
        with open(file_path, "rb") as file:
            header = file.read(12)
        if len(header) < 8 or header[4:8] != b"ftyp":
            raise ValueError("Video content is not an MP4 file")


def _remove_partial_file(tmp_path: str) -> None:
    try:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
    except OSError:
        pass


def save_video_bytes_to_project(
    project_path: str,
    video_bytes: bytes,
    task_id: str,
    *,
    validate_mp4: bool = False,
    max_bytes: int = MAX_VIDEO_BYTES,
) -> str:
    if not video_bytes:
        raise ValueError("video_bytes is empty")
    if len(video_bytes) > max_bytes:
        raise ValueError("Video exceeds the maximum allowed size")

    video_dir = ensure_video_dir(project_path)
    filename = _safe_video_filename(task_id)
    file_path = os.path.join(video_dir, filename)
    tmp_path = f"{file_path}.tmp"

    try:
        with open(tmp_path, "wb") as file:
            file.write(video_bytes)
        _validate_video_file(tmp_path, validate_mp4=validate_mp4)
        os.replace(tmp_path, file_path)
    except Exception:
        _remove_partial_file(tmp_path)
        raise
    return f"/api/video/{filename}"


def _validated_remote_url(remote_url: str, *, require_https: bool) -> str:
    parsed = urlparse(remote_url or "")
    if parsed.scheme not in {"http", "https"}:
        raise ValueError("remote_url must be an http(s) URL")
    if require_https and parsed.scheme != "https":
        raise ValueError("remote_url must be an HTTPS URL")
    if not parsed.netloc or parsed.username or parsed.password:
        raise ValueError("remote_url must have a valid host and no embedded credentials")
    return remote_url


async def download_video_to_project(
    project_path: str,
    remote_url: str,
    task_id: str,
    *,
    require_https: bool = False,
    validate_mp4: bool = False,
    max_bytes: int = MAX_VIDEO_BYTES,
    max_redirects: int = MAX_VIDEO_REDIRECTS,
) -> str:
    current_url = _validated_remote_url(remote_url, require_https=require_https)

    video_dir = ensure_video_dir(project_path)
    filename = _safe_video_filename(task_id)
    file_path = os.path.join(video_dir, filename)
    tmp_path = f"{file_path}.tmp"

    try:
        timeout = httpx.Timeout(connect=15.0, read=180.0, write=30.0, pool=30.0)
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=False) as client:
            for redirect_index in range(max_redirects + 1):
                async with client.stream("GET", current_url) as response:
                    if response.is_redirect:
                        location = response.headers.get("location")
                        if not location:
                            raise ValueError("Video redirect is missing a Location header")
                        if redirect_index >= max_redirects:
                            raise ValueError("Video download exceeded the redirect limit")
                        current_url = _validated_remote_url(
                            urljoin(current_url, location),
                            require_https=require_https,
                        )
                        continue

                    response.raise_for_status()
                    content_length = response.headers.get("content-length")
                    if content_length:
                        try:
                            parsed_length = int(content_length)
                        except ValueError as exc:
                            raise ValueError("Invalid video Content-Length header") from exc
                        if parsed_length > max_bytes:
                            raise ValueError("Video exceeds the maximum allowed size")

                    if validate_mp4:
                        content_type = response.headers.get("content-type", "").split(";", 1)[0].strip().lower()
                        if content_type and content_type not in _SYNC_VIDEO_CONTENT_TYPES:
                            raise ValueError("Video response has an unsupported Content-Type")

                    written = 0
                    with open(tmp_path, "wb") as file:
                        async for chunk in response.aiter_bytes():
                            if not chunk:
                                continue
                            written += len(chunk)
                            if written > max_bytes:
                                raise ValueError("Video exceeds the maximum allowed size")
                            file.write(chunk)
                    break
            else:
                raise ValueError("Video download exceeded the redirect limit")

        _validate_video_file(tmp_path, validate_mp4=validate_mp4)
        os.replace(tmp_path, file_path)
    except Exception:
        _remove_partial_file(tmp_path)
        raise
    return f"/api/video/{filename}"
