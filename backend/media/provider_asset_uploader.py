from __future__ import annotations

from pathlib import Path
from typing import Any, Awaitable, Callable
from urllib.parse import urlparse

from media.fal_asset_uploader import upload_to_fal_cdn
from media.kie_asset_uploader import upload_to_kie_cdn
from media.public_asset_service import PublicAssetService, prepare_provider_media_input
from media.provider_asset_types import ProviderAssetUploadResult
from media.wavespeed_asset_uploader import upload_to_wavespeed_media
from settings_resolver import resolve_provider_secret


ProviderUploader = Callable[..., Awaitable[Any]]
WAVESPEED_DIRECT_UPLOAD_MAX_BYTES = 300 * 1024 * 1024
KIE_BASE64_UPLOAD_MAX_BYTES = 10 * 1024 * 1024


def _is_public_url(value: str) -> bool:
    parsed = urlparse(value)
    return parsed.scheme in {"http", "https"} and (parsed.hostname or "").lower() not in {"127.0.0.1", "localhost", "0.0.0.0", "::1"}


def _is_data_uri(value: str) -> bool:
    return value.startswith("data:") and "," in value


def _mime_category(mime_type: str | None, filename: str | None = None) -> str:
    mime = (mime_type or "").lower()
    if mime.startswith("image/"):
        return "image"
    if mime.startswith("video/"):
        return "video"
    if mime.startswith("audio/"):
        return "audio"
    suffix = Path(filename or "").suffix.lower()
    if suffix in {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"}:
        return "image"
    if suffix in {".mp4", ".mov", ".webm"}:
        return "video"
    if suffix in {".mp3", ".wav", ".m4a", ".aac", ".ogg", ".opus", ".flac"}:
        return "audio"
    return "unknown"


def _validate_local_path_scope(asset: Any, project_path: str | None) -> None:
    value = str(asset or "").strip()
    if not value or _is_data_uri(value) or value.startswith("asset://"):
        return
    parsed = urlparse(value)
    if parsed.scheme in {"http", "https"}:
        return
    if isinstance(asset, bytes):
        return
    path = Path(value)
    if not path.is_absolute():
        return
    if not project_path:
        raise ValueError("Absolute local asset paths require project_path")
    try:
        path.resolve().relative_to(Path(project_path).resolve())
    except ValueError as exc:
        raise ValueError("Local asset path is outside the project workspace") from exc


class ProviderAssetUploadRouter:
    def __init__(
        self,
        *,
        public_asset_service: PublicAssetService | None = None,
        kie_uploader: ProviderUploader = upload_to_kie_cdn,
        fal_uploader: ProviderUploader = upload_to_fal_cdn,
        wavespeed_uploader: ProviderUploader = upload_to_wavespeed_media,
    ):
        self.public_assets = public_asset_service or PublicAssetService()
        self.kie_uploader = kie_uploader
        self.fal_uploader = fal_uploader
        self.wavespeed_uploader = wavespeed_uploader

    async def resolve(
        self,
        *,
        provider: str,
        asset: Any,
        purpose: str,
        preferred_upload: str | None = None,
        allow_r2_fallback: bool = True,
        allow_base64_image: bool = True,
        project_path: str | None = None,
        storage_provider: str | None = None,
    ) -> ProviderAssetUploadResult:
        provider_id = str(provider or "").strip().lower()
        value = "" if isinstance(asset, bytes) else str(asset or "").strip()
        if _is_public_url(value) and preferred_upload != "provider_cdn":
            return ProviderAssetUploadResult(provider=provider_id, source_kind="url", url=value, storage="remote")

        if provider_id == "kie":
            return await self._resolve_kie(
                asset=asset,
                purpose=purpose,
                project_path=project_path,
                preferred_upload=preferred_upload,
            )
        if provider_id == "fal":
            return await self._resolve_provider_cdn(
                provider=provider_id,
                asset=asset,
                purpose=purpose,
                project_path=project_path,
                env_var_name="FAL_API_KEY",
                uploader=self.fal_uploader,
                storage="fal_cdn",
            )
        if provider_id == "wavespeed":
            return await self._resolve_wavespeed(
                asset=asset,
                purpose=purpose,
                allow_r2_fallback=allow_r2_fallback,
                allow_base64_image=allow_base64_image,
                project_path=project_path,
                storage_provider=storage_provider,
                preferred_upload=preferred_upload,
            )
        if _is_data_uri(value):
            return ProviderAssetUploadResult(provider=provider_id, source_kind="data_uri", data_uri=value, storage="inline")
        raise ValueError(f"Provider asset upload routing is not supported for provider: {provider}")

    async def _resolve_provider_cdn(
        self,
        *,
        provider: str,
        asset: Any,
        purpose: str,
        project_path: str | None,
        env_var_name: str,
        uploader: ProviderUploader,
        storage: str,
    ) -> ProviderAssetUploadResult:
        value = str(asset or "").strip()
        if _is_public_url(value):
            raise NotImplementedError(f"{provider} provider CDN re-upload for remote URLs is not implemented in Phase 6.0")
        media = await self._prepare(asset, project_path)
        api_key = resolve_provider_secret(provider, "apiKey", env_var_name)
        if not api_key:
            raise ValueError(f"{provider.upper()} credentials are not configured")
        uploaded = await uploader(
            data=media.raw_data,
            filename=media.filename,
            mime_type=media.mime_type,
            api_key=api_key,
        )
        return ProviderAssetUploadResult(
            provider=provider,
            source_kind="provider_cdn",
            url=uploaded.get("url"),
            mime_type=media.mime_type,
            filename=media.filename,
            size_bytes=len(media.raw_data),
            storage=storage,
            raw=uploaded.get("raw") if isinstance(uploaded.get("raw"), dict) else uploaded,
        )

    async def _resolve_kie(
        self,
        *,
        asset: Any,
        purpose: str,
        project_path: str | None,
        preferred_upload: str | None,
    ) -> ProviderAssetUploadResult:
        value = "" if isinstance(asset, bytes) else str(asset or "").strip()
        api_key = resolve_provider_secret("kie", "apiKey", "KIE_API_KEY")
        if not api_key:
            raise ValueError("KIE credentials are not configured")

        if _is_public_url(value):
            uploaded = await self.kie_uploader(
                file_url=value,
                filename=Path(urlparse(value).path).name or None,
                api_key=api_key,
                preferred_upload="provider_cdn",
            )
            return self._coerce_upload_result(uploaded, provider="kie", default_storage="kie")

        if isinstance(asset, bytes):
            uploaded = await self.kie_uploader(
                data=asset,
                filename=None,
                mime_type=None,
                api_key=api_key,
                preferred_upload="stream",
            )
            return self._coerce_upload_result(uploaded, provider="kie", default_storage="kie")

        media = await self._prepare(asset, project_path)
        size_bytes = len(media.raw_data)
        if _is_data_uri(value) or self._looks_like_raw_base64(value):
            if size_bytes <= KIE_BASE64_UPLOAD_MAX_BYTES:
                uploaded = await self.kie_uploader(
                    base64_data=value,
                    filename=media.filename,
                    mime_type=media.mime_type,
                    api_key=api_key,
                    preferred_upload=preferred_upload,
                )
            else:
                uploaded = await self.kie_uploader(
                    data=media.raw_data,
                    filename=media.filename,
                    mime_type=media.mime_type,
                    api_key=api_key,
                    preferred_upload="stream",
                )
        else:
            uploaded = await self.kie_uploader(
                data=media.raw_data,
                filename=media.filename,
                mime_type=media.mime_type,
                api_key=api_key,
                preferred_upload="stream",
            )
        return self._coerce_upload_result(uploaded, provider="kie", default_storage="kie")

    async def _resolve_wavespeed(
        self,
        *,
        asset: Any,
        purpose: str,
        allow_r2_fallback: bool,
        allow_base64_image: bool,
        project_path: str | None,
        storage_provider: str | None,
        preferred_upload: str | None,
    ) -> ProviderAssetUploadResult:
        value = str(asset or "").strip()
        media = await self._prepare(asset, project_path)
        category = _mime_category(media.mime_type, media.filename)
        size_bytes = len(media.raw_data)

        if preferred_upload == "base64" and category == "image" and allow_base64_image and _is_data_uri(value):
            return ProviderAssetUploadResult(
                provider="wavespeed",
                source_kind="data_uri",
                data_uri=value,
                mime_type=media.mime_type,
                filename=media.filename,
                size_bytes=size_bytes,
                storage="inline",
            )

        if preferred_upload == "r2" or size_bytes > WAVESPEED_DIRECT_UPLOAD_MAX_BYTES:
            if not allow_r2_fallback:
                raise ValueError("WaveSpeed asset requires public asset fallback, but fallback is disabled")
            public_url = await self.public_assets.ensure_public_url(str(asset), project_path, storage_provider=storage_provider)
            return ProviderAssetUploadResult(
                provider="wavespeed",
                source_kind="public_asset",
                url=public_url,
                mime_type=media.mime_type,
                filename=media.filename,
                size_bytes=size_bytes,
                storage=storage_provider or "public_asset",
            )

        api_key = resolve_provider_secret("wavespeed", "apiKey", "WAVESPEED_API_KEY")
        if not api_key:
            raise ValueError("WAVESPEED credentials are not configured")
        uploaded = await self.wavespeed_uploader(
            data=media.raw_data,
            filename=media.filename,
            mime_type=media.mime_type,
            api_key=api_key,
        )
        uploaded_url = self._uploaded_value(uploaded, "url")
        uploaded_storage = self._uploaded_value(uploaded, "storage")
        uploaded_raw = self._uploaded_value(uploaded, "raw")
        return ProviderAssetUploadResult(
            provider="wavespeed",
            source_kind="provider_media",
            url=uploaded_url,
            mime_type=media.mime_type,
            filename=media.filename,
            size_bytes=size_bytes,
            storage=uploaded_storage or "wavespeed",
            raw=uploaded_raw if isinstance(uploaded_raw, dict) else uploaded if isinstance(uploaded, dict) else None,
        )

    async def _prepare(self, asset: Any, project_path: str | None):
        _validate_local_path_scope(asset, project_path)
        return await prepare_provider_media_input(str(asset or ""), project_path)

    def _uploaded_value(self, uploaded: Any, key: str) -> Any:
        if isinstance(uploaded, dict):
            return uploaded.get(key)
        return getattr(uploaded, key, None)

    def _coerce_upload_result(self, uploaded: Any, *, provider: str, default_storage: str) -> ProviderAssetUploadResult:
        if isinstance(uploaded, ProviderAssetUploadResult):
            return uploaded
        return ProviderAssetUploadResult(
            provider=provider,
            source_kind=str(self._uploaded_value(uploaded, "source_kind") or "provider_cdn"),
            url=self._uploaded_value(uploaded, "url"),
            data_uri=self._uploaded_value(uploaded, "data_uri"),
            mime_type=self._uploaded_value(uploaded, "mime_type"),
            filename=self._uploaded_value(uploaded, "filename"),
            size_bytes=self._uploaded_value(uploaded, "size_bytes"),
            storage=self._uploaded_value(uploaded, "storage") or default_storage,
            raw=self._uploaded_value(uploaded, "raw") if isinstance(self._uploaded_value(uploaded, "raw"), dict) else uploaded if isinstance(uploaded, dict) else None,
        )

    def _looks_like_raw_base64(self, value: str) -> bool:
        if not value or len(value) < 16 or any(char.isspace() for char in value):
            return False
        alphabet = set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=_-")
        return all(char in alphabet for char in value)


async def resolve_asset_for_provider(
    *,
    provider: str,
    asset: Any,
    purpose: str,
    preferred_upload: str | None = None,
    allow_r2_fallback: bool = True,
    project_path: str | None = None,
) -> ProviderAssetUploadResult:
    return await ProviderAssetUploadRouter().resolve(
        provider=provider,
        asset=asset,
        purpose=purpose,
        preferred_upload=preferred_upload,
        allow_r2_fallback=allow_r2_fallback,
        project_path=project_path,
    )
