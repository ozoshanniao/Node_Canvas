import os
import uuid


MIME_EXTENSIONS = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/webp": "webp",
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
