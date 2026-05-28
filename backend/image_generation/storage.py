import os
import re
import uuid
from urllib.parse import urlparse

import httpx


MIME_EXTENSIONS = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/webp": "webp",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/mp4": "m4a",
    "audio/aac": "aac",
    "audio/ogg": "ogg",
    "audio/opus": "opus",
    "audio/flac": "flac",
    "audio/webm": "webm",
    "video/mp4": "mp4",
}


def ensure_generation_dir(project_path: str) -> str:
    generation_dir = os.path.join(project_path, "generation")
    os.makedirs(generation_dir, exist_ok=True)
    return generation_dir


def wrap_image_url(path_or_url: str) -> str:
    if path_or_url.startswith("http://") or path_or_url.startswith("https://"):
        return path_or_url
    return f"http://127.0.0.1:8000{path_or_url}"


def wrap_image_result(result):
    if isinstance(result, list):
        return {"urls": [wrap_image_url(url) for url in result]}
    return {"url": wrap_image_url(result)}


def mime_to_extension(mime_type: str | None, default: str = "png") -> str:
    return MIME_EXTENSIONS.get((mime_type or "").lower(), default)


def extension_from_filename(filename: str | None, allowed: set[str] | None = None) -> str | None:
    if not filename:
        return None
    ext = os.path.splitext(filename)[1].lower().lstrip(".")
    if not ext:
        return None
    if allowed and ext not in allowed:
        return None
    return ext


def save_image_bytes(image_bytes: bytes, generation_dir: str, prefix: str, mime_type: str | None = None) -> str:
    os.makedirs(generation_dir, exist_ok=True)
    ext = mime_to_extension(mime_type)
    file_name = f"{prefix}_{uuid.uuid4().hex[:8]}.{ext}"
    file_path = os.path.join(generation_dir, file_name)
    with open(file_path, "wb") as f:
        f.write(image_bytes)
    if os.path.getsize(file_path) <= 0:
        raise ValueError(f"Saved image is empty: {file_path}")
    return f"/api/image/{file_name}"


def safe_generation_filename_stem(value: str) -> str:
    safe = re.sub(r"[^A-Za-z0-9_-]+", "_", str(value or "")).strip("_")
    if not safe:
        safe = uuid.uuid4().hex[:12]
    return safe


def image_extension_for_content_type(content_type: str | None) -> tuple[str, str]:
    mime_type = (content_type or "").split(";")[0].strip().lower()
    if mime_type == "image/jpeg":
        return "jpg", mime_type
    if mime_type == "image/webp":
        return "webp", mime_type
    if mime_type == "image/png":
        return "png", mime_type
    return "png", "image/png"


async def download_image_to_generation(
    project_path: str,
    remote_url: str,
    filename_stem: str,
) -> dict:
    parsed = urlparse(remote_url or "")
    if parsed.scheme not in {"http", "https"}:
        raise ValueError("remote_url must be an http(s) URL")

    generation_dir = ensure_generation_dir(project_path)
    timeout = httpx.Timeout(connect=15.0, read=120.0, write=30.0, pool=30.0)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        response = await client.get(remote_url)
        response.raise_for_status()
        image_bytes = response.content
        ext, mime_type = image_extension_for_content_type(response.headers.get("content-type"))

    if not image_bytes:
        raise ValueError("Downloaded image is empty")

    filename = f"{safe_generation_filename_stem(filename_stem)}.{ext}"
    file_path = os.path.join(generation_dir, filename)
    tmp_path = f"{file_path}.tmp"
    with open(tmp_path, "wb") as file:
        file.write(image_bytes)

    if os.path.getsize(tmp_path) <= 0:
        raise ValueError("Saved image is empty")

    os.replace(tmp_path, file_path)
    relative_path = f"generation/{filename}"
    return {
        "type": "image",
        "sourceType": "generated",
        "url": relative_path,
        "filePath": relative_path,
        "remoteUrl": remote_url,
        "filename": filename,
        "mimeType": mime_type,
    }


def ensure_input_dir(project_path: str) -> str:
    """Ensure input directory exists for user-uploaded and derived images."""
    input_dir = os.path.join(project_path, "input")
    os.makedirs(input_dir, exist_ok=True)
    return input_dir


def save_image_bytes_to_input(
    image_bytes: bytes,
    project_path: str,
    source_kind: str = "upload",
    mime_type: str | None = None,
    original_filename: str | None = None,
) -> dict:
    """
    Save image bytes to project input directory.

    Returns:
        dict with keys: relativePath, width, height, mimeType, bytes
    """
    input_dir = ensure_input_dir(project_path)
    allowed_exts = {"png", "jpg", "jpeg", "webp", "mp3", "wav", "m4a", "aac", "ogg", "opus", "flac", "webm", "mp4"}
    ext = extension_from_filename(original_filename, allowed_exts) or mime_to_extension(mime_type)

    # Generate filename with source kind prefix
    prefix = source_kind.lower()
    file_name = f"{prefix}_{uuid.uuid4().hex[:8]}.{ext}"
    file_path = os.path.join(input_dir, file_name)

    # Write file
    with open(file_path, "wb") as f:
        f.write(image_bytes)

    if os.path.getsize(file_path) <= 0:
        raise ValueError(f"Saved image is empty: {file_path}")

    # Get image dimensions using PIL if available
    width, height = None, None
    try:
        from PIL import Image
        with Image.open(file_path) as img:
            width, height = img.size
    except Exception:
        pass

    return {
        "relativePath": f"input/{file_name}",
        "width": width,
        "height": height,
        "mimeType": mime_type or f"image/{ext}",
        "bytes": len(image_bytes),
        "filename": original_filename or file_name,
    }
