import datetime as dt
import hashlib
import hmac
import mimetypes
import os
import sqlite3
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import quote, unquote, urlparse

import httpx

from engines.image_utils import decode_base64_payload, infer_mime_type


VIDEO_MIME_FALLBACKS = {
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".webm": "video/webm",
}
AUDIO_MIME_FALLBACKS = {
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".m4a": "audio/mp4",
    ".aac": "audio/aac",
    ".ogg": "audio/ogg",
    ".opus": "audio/opus",
    ".flac": "audio/flac",
    ".webm": "audio/webm",
    ".mp4": "audio/mp4",
}


@dataclass
class PreparedMediaInput:
    raw_data: bytes
    mime_type: str
    filename: str
    file_path: str | None = None


def _utc_now() -> dt.datetime:
    return dt.datetime.now(dt.UTC)


def _iso(value: dt.datetime) -> str:
    return value.isoformat()


def _parse_iso(value: str | None) -> dt.datetime | None:
    if not value:
        return None
    try:
        parsed = dt.datetime.fromisoformat(value)
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=dt.UTC)
    except ValueError:
        return None


def _guess_mime(path: str, raw_data: bytes | None = None) -> str:
    suffix = Path(path).suffix.lower()
    if suffix in VIDEO_MIME_FALLBACKS:
        return VIDEO_MIME_FALLBACKS[suffix]
    if suffix in AUDIO_MIME_FALLBACKS:
        return AUDIO_MIME_FALLBACKS[suffix]
    guessed = mimetypes.guess_type(path)[0]
    if guessed:
        return guessed
    return infer_mime_type(raw_data, "application/octet-stream")


def _extension_for(filename: str, mime_type: str) -> str:
    suffix = Path(filename).suffix.lower().lstrip(".")
    if suffix:
        return suffix
    guessed = mimetypes.guess_extension(mime_type or "") or ".bin"
    return guessed.lstrip(".")


def _project_candidate(project_path: str | None, value: str) -> Path | None:
    if not project_path:
        return None

    parsed = urlparse(value)
    raw_path = unquote(parsed.path or value)
    parts = [part for part in raw_path.replace("\\", "/").split("/") if part]
    filename = Path(raw_path).name
    if not filename:
        return None

    project = Path(project_path)
    candidates = []
    if len(parts) >= 3 and parts[-3] == "api" and parts[-2] == "input":
        candidates.append(project / "input" / filename)
    if len(parts) >= 3 and parts[-3] == "api" and parts[-2] in {"image", "generated", "video"}:
        candidates.append(project / "generation" / filename)
        candidates.append(project / "generation" / "videos" / filename)
    if len(parts) >= 2 and parts[-2] == "input":
        candidates.append(project / "input" / filename)
    if len(parts) >= 2 and parts[-2] == "generation":
        candidates.append(project / "generation" / filename)
    if len(parts) >= 2 and parts[-2] == "videos":
        candidates.append(project / "generation" / "videos" / filename)
    if not candidates and not Path(value).is_absolute():
        candidates.extend([project / value, project / "input" / filename, project / "generation" / filename])

    return next((candidate for candidate in candidates if candidate.exists()), None)


async def prepare_provider_media_input(value: str, project_path: str | None = None) -> PreparedMediaInput:
    raw_value = str(value or "").strip()
    if not raw_value:
        raise FileNotFoundError("Media input is empty")

    if raw_value.startswith("data:"):
        header = raw_value.split(",", 1)[0]
        mime_type = header.split(":", 1)[1].split(";", 1)[0] if ":" in header else "application/octet-stream"
        raw_data = decode_base64_payload(raw_value)
        ext = _extension_for(f"media{mimetypes.guess_extension(mime_type) or '.bin'}", mime_type)
        return PreparedMediaInput(raw_data=raw_data, mime_type=mime_type, filename=f"media.{ext}")

    path = Path(raw_value)
    if path.exists():
        raw_data = path.read_bytes()
        return PreparedMediaInput(
            raw_data=raw_data,
            mime_type=_guess_mime(str(path), raw_data),
            filename=path.name,
            file_path=str(path),
        )

    project_file = _project_candidate(project_path, raw_value)
    if project_file:
        raw_data = project_file.read_bytes()
        return PreparedMediaInput(
            raw_data=raw_data,
            mime_type=_guess_mime(str(project_file), raw_data),
            filename=project_file.name,
            file_path=str(project_file),
        )

    parsed = urlparse(raw_value)
    if parsed.scheme in {"http", "https"}:
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.get(raw_value)
            response.raise_for_status()
            raw_data = response.content
            filename = Path(unquote(parsed.path)).name or "media"
            mime_type = response.headers.get("content-type", "").split(";")[0] or _guess_mime(filename, raw_data)
            return PreparedMediaInput(raw_data=raw_data, mime_type=mime_type, filename=filename)

    try:
        raw_data = decode_base64_payload(raw_value)
        mime_type = infer_mime_type(raw_data, "application/octet-stream")
        return PreparedMediaInput(raw_data=raw_data, mime_type=mime_type, filename="media.bin")
    except Exception as exc:
        raise FileNotFoundError(f"Unable to resolve media input: {value}") from exc


class R2PublicAssetBackend:
    def __init__(self):
        self.account_id = os.getenv("CLOUDFLARE_R2_ACCOUNT_ID", "")
        self.access_key_id = os.getenv("CLOUDFLARE_R2_ACCESS_KEY_ID", "")
        self.secret_access_key = os.getenv("CLOUDFLARE_R2_SECRET_ACCESS_KEY", "")
        self.bucket = os.getenv("CLOUDFLARE_R2_BUCKET_NAME", "")
        self.public_domain = os.getenv("CLOUDFLARE_R2_PUBLIC_DOMAIN", "").rstrip("/")
        self.endpoint = (os.getenv("CLOUDFLARE_R2_ENDPOINT") or "").rstrip("/")
        if not self.endpoint and self.account_id:
            self.endpoint = f"https://{self.account_id}.r2.cloudflarestorage.com"

    def _require_config(self) -> None:
        missing = [
            name
            for name, value in {
                "CLOUDFLARE_R2_ACCESS_KEY_ID": self.access_key_id,
                "CLOUDFLARE_R2_SECRET_ACCESS_KEY": self.secret_access_key,
                "CLOUDFLARE_R2_BUCKET_NAME": self.bucket,
                "CLOUDFLARE_R2_PUBLIC_DOMAIN": self.public_domain,
                "CLOUDFLARE_R2_ENDPOINT or CLOUDFLARE_R2_ACCOUNT_ID": self.endpoint,
            }.items()
            if not value
        ]
        if missing:
            raise ValueError(f"Public R2 asset storage is not configured: {', '.join(missing)}")

    def _signing_key(self, date_stamp: str) -> bytes:
        key = ("AWS4" + self.secret_access_key).encode("utf-8")
        for value in (date_stamp, "auto", "s3", "aws4_request"):
            key = hmac.new(key, value.encode("utf-8"), hashlib.sha256).digest()
        return key

    def _auth_headers(self, method: str, url_path: str, payload_hash: str, content_type: str, now: dt.datetime) -> dict:
        amz_date = now.strftime("%Y%m%dT%H%M%SZ")
        date_stamp = now.strftime("%Y%m%d")
        host = urlparse(self.endpoint).netloc
        canonical_headers = (
            f"content-type:{content_type}\n"
            f"host:{host}\n"
            f"x-amz-content-sha256:{payload_hash}\n"
            f"x-amz-date:{amz_date}\n"
        )
        signed_headers = "content-type;host;x-amz-content-sha256;x-amz-date"
        canonical_request = "\n".join([method, url_path, "", canonical_headers, signed_headers, payload_hash])
        credential_scope = f"{date_stamp}/auto/s3/aws4_request"
        string_to_sign = "\n".join([
            "AWS4-HMAC-SHA256",
            amz_date,
            credential_scope,
            hashlib.sha256(canonical_request.encode("utf-8")).hexdigest(),
        ])
        signature = hmac.new(self._signing_key(date_stamp), string_to_sign.encode("utf-8"), hashlib.sha256).hexdigest()
        return {
            "Authorization": (
                f"AWS4-HMAC-SHA256 Credential={self.access_key_id}/{credential_scope}, "
                f"SignedHeaders={signed_headers}, Signature={signature}"
            ),
            "Content-Type": content_type,
            "x-amz-content-sha256": payload_hash,
            "x-amz-date": amz_date,
        }

    async def upload(self, storage_key: str, raw_data: bytes, mime_type: str) -> str:
        self._require_config()
        safe_key = "/".join(quote(part) for part in storage_key.split("/"))
        path = f"/{self.bucket}/{safe_key}"
        url = f"{self.endpoint}{path}"
        now = _utc_now()
        payload_hash = hashlib.sha256(raw_data).hexdigest()
        headers = self._auth_headers("PUT", path, payload_hash, mime_type, now)
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.put(url, content=raw_data, headers=headers)
            response.raise_for_status()
        return f"{self.public_domain}/{safe_key}"


class TOSPublicAssetBackend:
    def __init__(self):
        self.access_key_id = os.getenv("VOLCENGINE_TOS_ACCESS_KEY_ID", "")
        self.secret_access_key = os.getenv("VOLCENGINE_TOS_SECRET_ACCESS_KEY", "")
        self.bucket = os.getenv("VOLCENGINE_TOS_BUCKET_NAME", "")
        self.region = os.getenv("VOLCENGINE_TOS_REGION", "cn-beijing")
        self.endpoint_host = self._normalize_endpoint(os.getenv("VOLCENGINE_TOS_ENDPOINT", "tos-cn-beijing.volces.com"))
        self.endpoint = f"https://{self.endpoint_host}" if self.endpoint_host else ""
        self.public_domain = os.getenv("VOLCENGINE_TOS_PUBLIC_DOMAIN", "").rstrip("/")

    @staticmethod
    def _normalize_endpoint(endpoint: str) -> str:
        value = (endpoint or "").strip().rstrip("/")
        if not value:
            return ""
        parsed = urlparse(value if "://" in value else f"https://{value}")
        return (parsed.netloc or parsed.path).strip("/")

    def _require_config(self) -> None:
        missing = [
            name
            for name, value in {
                "VOLCENGINE_TOS_ACCESS_KEY_ID": self.access_key_id,
                "VOLCENGINE_TOS_SECRET_ACCESS_KEY": self.secret_access_key,
                "VOLCENGINE_TOS_BUCKET_NAME": self.bucket,
                "VOLCENGINE_TOS_REGION": self.region,
                "VOLCENGINE_TOS_ENDPOINT": self.endpoint_host,
            }.items()
            if not value
        ]
        if missing:
            raise ValueError(f"Public TOS asset storage is not configured: {', '.join(missing)}")

    def _signing_key(self, date_stamp: str, service_name: str) -> bytes:
        key = ("AWS4" + self.secret_access_key).encode("utf-8")
        for value in (date_stamp, self.region, service_name, "aws4_request"):
            key = hmac.new(key, value.encode("utf-8"), hashlib.sha256).digest()
        return key

    def _auth_headers(self, method: str, host: str, url_path: str, payload_hash: str, content_type: str, now: dt.datetime) -> dict:
        amz_date = now.strftime("%Y%m%dT%H%M%SZ")
        date_stamp = now.strftime("%Y%m%d")
        service_name = "s3" if "s3" in host else "tos"
        canonical_headers = (
            f"content-type:{content_type}\n"
            f"host:{host}\n"
            f"x-amz-content-sha256:{payload_hash}\n"
            f"x-amz-date:{amz_date}\n"
        )
        signed_headers = "content-type;host;x-amz-content-sha256;x-amz-date"
        canonical_request = "\n".join([method, url_path, "", canonical_headers, signed_headers, payload_hash])
        credential_scope = f"{date_stamp}/{self.region}/{service_name}/aws4_request"
        string_to_sign = "\n".join([
            "AWS4-HMAC-SHA256",
            amz_date,
            credential_scope,
            hashlib.sha256(canonical_request.encode("utf-8")).hexdigest(),
        ])
        signature = hmac.new(self._signing_key(date_stamp, service_name), string_to_sign.encode("utf-8"), hashlib.sha256).hexdigest()
        return {
            "Authorization": (
                f"AWS4-HMAC-SHA256 Credential={self.access_key_id}/{credential_scope}, "
                f"SignedHeaders={signed_headers}, Signature={signature}"
            ),
            "Content-Type": content_type,
            "x-amz-content-sha256": payload_hash,
            "x-amz-date": amz_date,
        }

    def public_url_for(self, safe_key: str) -> str:
        if self.public_domain:
            return f"{self.public_domain}/{safe_key}"
        return f"https://{self.bucket}.{self.endpoint_host}/{safe_key}"

    async def upload(self, storage_key: str, raw_data: bytes, mime_type: str) -> str:
        self._require_config()
        safe_key = "/".join(quote(part) for part in storage_key.split("/"))
        host = f"{self.bucket}.{self.endpoint_host}"
        path = f"/{safe_key}"
        url = f"https://{host}{path}"
        now = _utc_now()
        payload_hash = hashlib.sha256(raw_data).hexdigest()
        headers = self._auth_headers("PUT", host, path, payload_hash, mime_type, now)
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.put(url, content=raw_data, headers=headers)
            response.raise_for_status()
        return self.public_url_for(safe_key)


class PublicAssetService:
    def __init__(self, backend: R2PublicAssetBackend | None = None, cache_db_path: str | None = None):
        self._backends = {}
        if backend is not None:
            self._backends["r2"] = backend
        self.storage = os.getenv("PUBLIC_ASSET_STORAGE", "r2").lower()
        self.prefix = os.getenv("PUBLIC_ASSET_PREFIX", "node-canvas/seedance-input/").strip("/")
        self.cache_ttl_days = int(os.getenv("PUBLIC_ASSET_CACHE_TTL_DAYS", "4"))
        self.cache_db_path = cache_db_path or str(Path(__file__).resolve().parents[1] / ".cache" / "public_assets" / "cache.db")
        self._memory_conn = None

    def close(self) -> None:
        if self._memory_conn is not None:
            self._memory_conn.close()
            self._memory_conn = None

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        self.close()
        return False

    def __del__(self):
        self.close()

    def _resolve_storage_provider(self, storage_provider: str | None = None) -> str:
        provider = (storage_provider or self.storage or "r2").strip().lower()
        if provider not in {"r2", "tos"}:
            raise ValueError(f"Unsupported public asset storage provider: {provider}")
        return provider

    def _backend_for(self, storage_provider: str):
        if storage_provider not in self._backends:
            if storage_provider == "r2":
                self._backends[storage_provider] = R2PublicAssetBackend()
            elif storage_provider == "tos":
                self._backends[storage_provider] = TOSPublicAssetBackend()
            else:
                raise ValueError(f"Unsupported public asset storage provider: {storage_provider}")
        return self._backends[storage_provider]

    def _connect(self):
        if self.cache_db_path == ":memory:":
            if self._memory_conn is None:
                self._memory_conn = sqlite3.connect(":memory:")
            conn = self._memory_conn
        else:
            db_path = Path(self.cache_db_path)
            db_path.parent.mkdir(parents=True, exist_ok=True)
            conn = sqlite3.connect(db_path)
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS public_assets (
                cache_key TEXT PRIMARY KEY,
                public_url TEXT NOT NULL,
                storage_key TEXT NOT NULL,
                uploaded_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                mime_type TEXT NOT NULL
            )
            """
        )
        return conn

    def _cache_get(self, cache_key: str) -> str | None:
        conn = self._connect()
        try:
            row = conn.execute(
                "SELECT public_url, expires_at FROM public_assets WHERE cache_key = ?",
                (cache_key,),
            ).fetchone()
        finally:
            if self.cache_db_path != ":memory:":
                conn.close()
        if not row:
            return None
        public_url, expires_at = row
        parsed_expiry = _parse_iso(expires_at)
        if parsed_expiry and parsed_expiry > _utc_now():
            return public_url
        return None

    def _cache_put(self, cache_key: str, public_url: str, storage_key: str, mime_type: str) -> None:
        uploaded_at = _utc_now()
        expires_at = uploaded_at + dt.timedelta(days=self.cache_ttl_days)
        conn = self._connect()
        try:
            conn.execute(
                """
                INSERT OR REPLACE INTO public_assets
                (cache_key, public_url, storage_key, uploaded_at, expires_at, mime_type)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (cache_key, public_url, storage_key, _iso(uploaded_at), _iso(expires_at), mime_type),
            )
            conn.commit()
        finally:
            if self.cache_db_path != ":memory:":
                conn.close()

    async def ensure_public_url(
        self,
        input_path_or_url: str,
        project_path: str | None = None,
        storage_provider: str | None = None,
    ) -> str:
        value = str(input_path_or_url or "").strip()
        parsed = urlparse(value)
        if parsed.scheme in {"http", "https"} and (parsed.hostname or "").lower() not in {"127.0.0.1", "localhost", "0.0.0.0", "::1"}:
            return value
        if value.startswith("asset://"):
            return value
        provider = self._resolve_storage_provider(storage_provider)

        media = await prepare_provider_media_input(value, project_path)
        digest = hashlib.sha256(media.raw_data).hexdigest()
        ext = _extension_for(media.filename, media.mime_type)
        cache_key = f"{provider}:{digest}:{len(media.raw_data)}:{ext}"
        cached_url = self._cache_get(cache_key)
        if cached_url:
            return cached_url

        storage_key = f"{self.prefix}/{_utc_now().strftime('%Y-%m-%d')}/{digest}.{ext}".strip("/")
        public_url = await self._backend_for(provider).upload(storage_key, media.raw_data, media.mime_type)
        self._cache_put(cache_key, public_url, storage_key, media.mime_type)
        return public_url
