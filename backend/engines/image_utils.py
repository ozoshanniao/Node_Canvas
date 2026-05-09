import base64
import mimetypes
import os
import uuid
from dataclasses import dataclass
from urllib.parse import unquote, urlparse

import httpx


MIME_EXTENSIONS = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/webp": "webp",
}


@dataclass
class NormalizedImageInput:
    source_type: str
    mime_type: str
    raw_data: bytes | None = None
    base64_data: str | None = None
    resolved_url: str | None = None
    file_path: str | None = None
    filename: str | None = None


def mime_to_extension(mime_type: str | None, default: str = "png") -> str:
    return MIME_EXTENSIONS.get((mime_type or "").lower(), default)


def infer_mime_type(raw_data: bytes | None, fallback: str = "image/png") -> str:
    if not raw_data:
        return fallback
    if raw_data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if raw_data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if raw_data.startswith(b"RIFF") and raw_data[8:12] == b"WEBP":
        return "image/webp"
    return fallback


def decode_base64_payload(value: str) -> bytes:
    payload = "".join(value.split()).split(",")[-1]
    return base64.b64decode(payload)


def encode_base64(raw_data: bytes) -> str:
    return base64.b64encode(raw_data).decode("ascii")


def _file_name_from_input(value: str) -> str | None:
    parsed = urlparse(value)
    path = unquote(parsed.path or value)
    file_name = os.path.basename(path)
    return file_name or None


def _project_file_path(value: str, gen_dir: str | None) -> tuple[str | None, str | None]:
    file_name = _file_name_from_input(value)
    if not file_name:
        return None, None
    if gen_dir:
        return file_name, os.path.join(gen_dir, file_name)
    return file_name, value if os.path.exists(value) else None


def normalize_image_input(value, gen_dir: str | None = None) -> NormalizedImageInput:
    value = str(value)

    if value.startswith("data:image/"):
        header, b64_data = value.split(",", 1)
        mime_type = header.split(":", 1)[1].split(";", 1)[0] if ":" in header else "image/png"
        raw_data = decode_base64_payload(b64_data)
        return NormalizedImageInput(
            source_type="base64",
            mime_type=mime_type,
            raw_data=raw_data,
            base64_data=encode_base64(raw_data),
            filename=f"image.{mime_to_extension(mime_type)}",
        )

    if os.path.exists(value):
        raw_data = open(value, "rb").read()
        mime_type = mimetypes.guess_type(value)[0] or infer_mime_type(raw_data)
        return NormalizedImageInput(
            source_type="file_path",
            mime_type=mime_type,
            raw_data=raw_data,
            base64_data=encode_base64(raw_data),
            file_path=value,
            filename=os.path.basename(value),
        )

    parsed = urlparse(value)
    if parsed.scheme in {"http", "https"}:
        file_name, local_path = _project_file_path(value, gen_dir)
        if local_path and os.path.exists(local_path):
            raw_data = open(local_path, "rb").read()
            mime_type = mimetypes.guess_type(local_path)[0] or infer_mime_type(raw_data)
            return NormalizedImageInput(
                source_type="file_path",
                mime_type=mime_type,
                raw_data=raw_data,
                base64_data=encode_base64(raw_data),
                resolved_url=value,
                file_path=local_path,
                filename=file_name,
            )
        return NormalizedImageInput(
            source_type="url",
            mime_type=mimetypes.guess_type(parsed.path)[0] or "image/png",
            resolved_url=value,
            filename=file_name,
        )

    file_name, local_path = _project_file_path(value, gen_dir)
    if local_path and os.path.exists(local_path):
        raw_data = open(local_path, "rb").read()
        mime_type = mimetypes.guess_type(local_path)[0] or infer_mime_type(raw_data)
        return NormalizedImageInput(
            source_type="file_path",
            mime_type=mime_type,
            raw_data=raw_data,
            base64_data=encode_base64(raw_data),
            file_path=local_path,
            filename=file_name,
        )

    try:
        raw_data = decode_base64_payload(value)
        mime_type = infer_mime_type(raw_data)
        return NormalizedImageInput(
            source_type="base64",
            mime_type=mime_type,
            raw_data=raw_data,
            base64_data=encode_base64(raw_data),
            filename=f"image.{mime_to_extension(mime_type)}",
        )
    except Exception:
        return NormalizedImageInput(source_type="unknown", mime_type="image/png", filename=file_name)


async def prepare_provider_image_input(value, gen_dir: str | None = None, prefer: str = "base64") -> NormalizedImageInput:
    image = normalize_image_input(value, gen_dir)
    if prefer == "url" and image.resolved_url:
        return image

    if image.raw_data:
        if not image.base64_data:
            image.base64_data = encode_base64(image.raw_data)
        return image

    if image.resolved_url:
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.get(image.resolved_url)
            response.raise_for_status()
            raw_data = response.content
            mime_type = response.headers.get("content-type", "").split(";")[0] or infer_mime_type(raw_data, image.mime_type)
            image.raw_data = raw_data
            image.mime_type = mime_type
            image.base64_data = encode_base64(raw_data)
            return image

    raise FileNotFoundError(f"Unable to resolve image input: {value}")


async def prepare_provider_image_inputs(values, gen_dir: str | None = None, prefer: str = "base64"):
    if not values:
        return []
    return [await prepare_provider_image_input(value, gen_dir, prefer=prefer) for value in values]


def save_base64_image(base64_data: str, gen_dir: str, prefix: str, mime_type: str | None = None) -> str:
    raw_data = decode_base64_payload(base64_data)
    resolved_mime = mime_type or infer_mime_type(raw_data)
    ext = mime_to_extension(resolved_mime)
    os.makedirs(gen_dir, exist_ok=True)
    file_name = f"{prefix}_{uuid.uuid4().hex[:8]}.{ext}"
    file_path = os.path.join(gen_dir, file_name)
    with open(file_path, "wb") as f:
        f.write(raw_data)
    if os.path.getsize(file_path) <= 0:
        raise ValueError(f"Saved image is empty: {file_path}")
    return f"/api/image/{file_name}"
