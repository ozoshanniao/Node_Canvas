import mimetypes
import os
import re
from pathlib import Path


def safe_generation_token(value: str) -> str:
    token = re.sub(r"[^A-Za-z0-9_-]+", "_", str(value or "").strip())
    return token.strip("_")[:96] or "unknown"


def resolve_generation_path(project_path: str, subpath: str) -> Path:
    if not project_path:
        raise ValueError("projectPath is required")
    if not subpath or ".." in subpath or "\\" in subpath:
        raise ValueError("Invalid generation path")
    if os.path.isabs(subpath):
        raise ValueError("Invalid generation path")

    generation_dir = (Path(project_path).resolve() / "generation").resolve()
    target_path = (generation_dir / subpath).resolve()
    if generation_dir != target_path and generation_dir not in target_path.parents:
        raise ValueError("Invalid generation path")
    return target_path


def extension_for_upload(filename: str, content_type: str = "") -> str:
    filename_suffix = Path(filename or "").suffix.lower()
    content_type = (content_type or "").split(";", 1)[0].strip().lower()
    if filename_suffix in {".mp4", ".webm", ".mov"}:
        return filename_suffix
    if content_type == "video/webm":
        return ".webm"
    if content_type in {"video/quicktime", "video/mov"}:
        return ".mov"
    return ".mp4"


def guess_generation_content_type(filename: str) -> str:
    suffix = Path(filename).suffix.lower()
    if suffix == ".mp4":
        return "video/mp4"
    if suffix == ".webm":
        return "video/webm"
    if suffix == ".mov":
        return "video/quicktime"
    return mimetypes.guess_type(filename)[0] or "application/octet-stream"


def save_ease_curve_generation_file(
    project_path: str,
    node_id: str,
    run_request_id: str,
    filename: str,
    content_bytes: bytes,
    content_type: str = "",
) -> dict[str, str]:
    safe_node_id = safe_generation_token(node_id)
    safe_run_request_id = safe_generation_token(run_request_id)
    extension = extension_for_upload(filename, content_type)
    relative_path = f"ease_curve/ease_curve_{safe_node_id}_{safe_run_request_id}{extension}"
    output_path = resolve_generation_path(project_path, relative_path)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "wb") as output_file:
        output_file.write(content_bytes)

    for old_file in output_path.parent.glob(f"ease_curve_{safe_node_id}_*"):
        if old_file == output_path or old_file.suffix.lower() not in {".mp4", ".webm"}:
            continue
        try:
            old_file.unlink()
        except OSError:
            pass

    api_path = f"generation/{relative_path}"
    return {
        "path": api_path,
        "url": f"/api/generation/{relative_path}",
    }
