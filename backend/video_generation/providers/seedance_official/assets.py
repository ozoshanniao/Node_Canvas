import base64
import os
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import unquote, urlparse


LOCAL_HTTP_HOSTS = {"127.0.0.1", "localhost", "0.0.0.0", "::1"}

IMAGE_MIME_BY_EXT = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".bmp": "image/bmp",
    ".tiff": "image/tiff",
    ".tif": "image/tiff",
    ".gif": "image/gif",
    ".heic": "image/heic",
    ".heif": "image/heif",
}

AUDIO_MIME_BY_EXT = {
    ".wav": "audio/wav",
    ".mp3": "audio/mpeg",
}


@dataclass(frozen=True)
class SeedanceAssetConfig:
    image_transfer: str = "base64-first"
    image_base64_max_bytes: int = 10 * 1024 * 1024
    image_base64_total_max_bytes: int = 40 * 1024 * 1024
    audio_transfer: str = "base64-first"
    audio_base64_max_bytes: int = 15 * 1024 * 1024


def _env_mb(name: str, default: int) -> int:
    try:
        return int(float(os.getenv(name, str(default))) * 1024 * 1024)
    except ValueError:
        return default * 1024 * 1024


def seedance_asset_config_from_env() -> SeedanceAssetConfig:
    return SeedanceAssetConfig(
        image_transfer=os.getenv("SEEDANCE_IMAGE_TRANSFER", "base64-first").strip().lower(),
        image_base64_max_bytes=_env_mb("SEEDANCE_IMAGE_BASE64_MAX_MB", 10),
        image_base64_total_max_bytes=_env_mb("SEEDANCE_IMAGE_BASE64_TOTAL_MAX_MB", 40),
        audio_transfer=os.getenv("SEEDANCE_AUDIO_TRANSFER", "base64-first").strip().lower(),
        audio_base64_max_bytes=_env_mb("SEEDANCE_AUDIO_BASE64_MAX_MB", 15),
    )


def _asset_value(asset) -> str:
    if isinstance(asset, dict):
        for key in ("filePath", "url", "imageUrl", "audioUrl", "src", "relativePath"):
            value = asset.get(key)
            if value:
                return str(value)
        return ""
    return str(asset or "")


def _audio_suffix_for_value(value: str) -> str:
    if value.startswith("data:"):
        header = value.split(",", 1)[0].lower()
        if header.startswith("data:audio/wav"):
            return ".wav"
        if header.startswith("data:audio/mpeg") or header.startswith("data:audio/mp3"):
            return ".mp3"
        return ""
    return Path(urlparse(value).path or value).suffix.lower()


def _is_public_http_url(value: str) -> bool:
    parsed = urlparse(value)
    return parsed.scheme in {"http", "https"} and (parsed.hostname or "").lower() not in LOCAL_HTTP_HOSTS


def _local_project_file(value: str, project_root: str | None) -> Path | None:
    if not value:
        return None

    path = Path(value)
    if path.exists():
        return path

    if not project_root:
        return None

    project = Path(project_root)
    parsed = urlparse(value)
    raw_path = unquote(parsed.path or value)
    normalized = raw_path.replace("\\", "/")
    parts = [part for part in normalized.split("/") if part]
    filename = Path(raw_path).name

    candidates: list[Path] = []
    if len(parts) >= 3 and parts[-3] == "api" and parts[-2] == "input":
        candidates.append(project / "input" / filename)
    if len(parts) >= 3 and parts[-3] == "api" and parts[-2] in {"image", "generated"}:
        candidates.append(project / "generation" / filename)
    if len(parts) >= 2 and parts[-2] == "input":
        candidates.append(project / "input" / filename)
    if len(parts) >= 2 and parts[-2] == "generation":
        candidates.append(project / "generation" / filename)
    if len(parts) >= 2 and parts[-2] == "videos":
        candidates.append(project / "generation" / "videos" / filename)
    if not Path(value).is_absolute():
        candidates.append(project / value)
        if filename:
            candidates.append(project / "input" / filename)
            candidates.append(project / "generation" / filename)

    return next((candidate for candidate in candidates if candidate.exists()), None)


def _data_url(path: Path, mime_type: str) -> str:
    return f"data:{mime_type};base64,{base64.b64encode(path.read_bytes()).decode('ascii')}"


async def resolve_seedance_image_asset(
    asset,
    *,
    public_asset_service,
    project_root: str | None,
    base64_state: dict,
    config: SeedanceAssetConfig | None = None,
    storage_provider: str | None = None,
) -> str:
    value = _asset_value(asset).strip()
    if not value:
        return value
    if value.startswith("data:image/") or _is_public_http_url(value):
        return value

    config = config or seedance_asset_config_from_env()
    if config.image_transfer != "base64-first":
        return await public_asset_service.ensure_public_url(value, project_root, storage_provider=storage_provider)

    path = _local_project_file(value, project_root)
    if not path:
        return await public_asset_service.ensure_public_url(value, project_root, storage_provider=storage_provider)

    mime_type = IMAGE_MIME_BY_EXT.get(path.suffix.lower())
    if not mime_type:
        return await public_asset_service.ensure_public_url(value, project_root, storage_provider=storage_provider)

    try:
        size = path.stat().st_size
        current_total = int(base64_state.get("image_base64_total_bytes") or 0)
        if size > config.image_base64_max_bytes or current_total + size > config.image_base64_total_max_bytes:
            return await public_asset_service.ensure_public_url(value, project_root, storage_provider=storage_provider)
        result = _data_url(path, mime_type)
        base64_state["image_base64_total_bytes"] = current_total + size
        return result
    except Exception:
        return await public_asset_service.ensure_public_url(value, project_root, storage_provider=storage_provider)


async def resolve_seedance_audio_asset(
    asset,
    *,
    public_asset_service,
    project_root: str | None,
    config: SeedanceAssetConfig | None = None,
    storage_provider: str | None = None,
) -> str:
    value = _asset_value(asset).strip()
    if not value:
        return value
    path = _local_project_file(value, project_root)
    suffix = path.suffix.lower() if path else _audio_suffix_for_value(value)
    mime_type = AUDIO_MIME_BY_EXT.get(suffix)
    if not mime_type:
        raise ValueError("Seedance audio references support only wav and mp3")
    if value.startswith("data:audio/") or _is_public_http_url(value):
        return value

    config = config or seedance_asset_config_from_env()

    if config.audio_transfer != "base64-first":
        return await public_asset_service.ensure_public_url(value, project_root, storage_provider=storage_provider)

    if not path:
        return await public_asset_service.ensure_public_url(value, project_root, storage_provider=storage_provider)

    size = path.stat().st_size
    if size > config.audio_base64_max_bytes:
        raise ValueError("Seedance audio reference must be 15MB or less")

    try:
        return _data_url(path, mime_type)
    except Exception:
        return await public_asset_service.ensure_public_url(value, project_root, storage_provider=storage_provider)
