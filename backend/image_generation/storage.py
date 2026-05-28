import os
import uuid


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
