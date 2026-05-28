import asyncio
import os
import unittest
from pathlib import Path
from unittest.mock import patch

from media.public_asset_service import PublicAssetService, R2PublicAssetBackend, TOSPublicAssetBackend


def run(coro):
    return asyncio.run(coro)


FIXTURE_ROOT = Path(__file__).resolve().parent / "fixtures" / "public_asset_project"
FIXTURE_MEDIA = FIXTURE_ROOT / "input" / "seedance-r2-smoke.txt"
FIXTURE_API_IMAGE = FIXTURE_ROOT / "generation" / "frame.png"
FIXTURE_OPUS = FIXTURE_ROOT / "input" / "voice.opus"
FIXTURE_FLAC = FIXTURE_ROOT / "input" / "voice.flac"


class FakeR2Backend:
    def __init__(self, fail=False):
        self.fail = fail
        self.uploads = []

    async def upload(self, storage_key, raw_data, mime_type):
        if self.fail:
            raise RuntimeError("mock R2 upload failed")
        self.uploads.append({
            "storage_key": storage_key,
            "raw_data": raw_data,
            "mime_type": mime_type,
        })
        return f"https://public-r2.test/{storage_key}"


class FakeTOSBackend:
    def __init__(self, fail=False):
        self.fail = fail
        self.uploads = []

    async def upload(self, storage_key, raw_data, mime_type):
        if self.fail:
            raise RuntimeError("mock TOS upload failed")
        self.uploads.append({
            "storage_key": storage_key,
            "raw_data": raw_data,
            "mime_type": mime_type,
        })
        return f"https://public-tos.test/{storage_key}"


class PublicAssetServiceRegressionTest(unittest.TestCase):
    def test_r2_endpoint_is_derived_from_account_id(self):
        with patch.dict(os.environ, {
            "CLOUDFLARE_R2_ACCOUNT_ID": "abc123",
            "CLOUDFLARE_R2_ENDPOINT": "",
        }, clear=False):
            backend = R2PublicAssetBackend()
            self.assertEqual(backend.endpoint, "https://abc123.r2.cloudflarestorage.com")

    def test_http_public_url_passthrough_without_upload(self):
        backend = FakeR2Backend()
        service = PublicAssetService(backend=backend, cache_db_path=":memory:")

        self.assertEqual(
            run(service.ensure_public_url("https://cdn.example.test/media.png")),
            "https://cdn.example.test/media.png",
        )
        self.assertEqual(backend.uploads, [])

    def test_http_public_url_passthrough_without_upload_when_storage_is_unknown(self):
        backend = FakeR2Backend()
        with patch.dict(os.environ, {"PUBLIC_ASSET_STORAGE": "unknown"}, clear=False):
            service = PublicAssetService(backend=backend, cache_db_path=":memory:")

            self.assertEqual(
                run(service.ensure_public_url("https://cdn.example.test/media.png")),
                "https://cdn.example.test/media.png",
            )
            self.assertEqual(backend.uploads, [])

    def test_local_file_upload_cache_fields_and_expiry(self):
        backend = FakeR2Backend()
        with patch.dict(os.environ, {
            "PUBLIC_ASSET_STORAGE": "r2",
            "PUBLIC_ASSET_PREFIX": "node-canvas/seedance-input/",
            "PUBLIC_ASSET_CACHE_TTL_DAYS": "4",
        }, clear=False):
            service = PublicAssetService(backend=backend, cache_db_path=":memory:")
            first_url = run(service.ensure_public_url(str(FIXTURE_MEDIA)))
            second_url = run(service.ensure_public_url(str(FIXTURE_MEDIA)))

            self.assertEqual(first_url, second_url)
            self.assertEqual(len(backend.uploads), 1)
            self.assertEqual(backend.uploads[0]["mime_type"], "text/plain")
            self.assertRegex(
                backend.uploads[0]["storage_key"],
                r"^node-canvas/seedance-input/\d{4}-\d{2}-\d{2}/[a-f0-9]{64}\.txt$",
            )

            row = service._connect().execute(
                """
                SELECT public_url, storage_key, uploaded_at, expires_at, mime_type
                FROM public_assets
                """
            ).fetchone()
            self.assertEqual(row[0], first_url)
            self.assertEqual(row[1], backend.uploads[0]["storage_key"])
            self.assertRegex(row[2], r"^\d{4}-\d{2}-\d{2}T")
            self.assertRegex(row[3], r"^\d{4}-\d{2}-\d{2}T")
            self.assertEqual(row[4], "text/plain")

            service._connect().execute(
                "UPDATE public_assets SET expires_at = ?",
                ("2000-01-01T00:00:00+00:00",),
            )
            expired_url = run(service.ensure_public_url(str(FIXTURE_MEDIA)))

            self.assertEqual(expired_url, first_url)
            self.assertEqual(len(backend.uploads), 2)

    def test_api_image_path_resolves_to_project_file_and_uploads(self):
        backend = FakeR2Backend()
        service = PublicAssetService(backend=backend, cache_db_path=":memory:")
        url = run(service.ensure_public_url("/api/image/frame.png", str(FIXTURE_ROOT)))

        self.assertTrue(url.startswith("https://public-r2.test/"))
        self.assertEqual(len(backend.uploads), 1)
        self.assertEqual(backend.uploads[0]["mime_type"], "image/png")

    def test_audio_opus_and_flac_mime_fallbacks_preserve_extension(self):
        backend = FakeR2Backend()
        service = PublicAssetService(backend=backend, cache_db_path=":memory:")

        opus_url = run(service.ensure_public_url(str(FIXTURE_OPUS)))
        flac_url = run(service.ensure_public_url(str(FIXTURE_FLAC)))

        self.assertTrue(opus_url.endswith(".opus"))
        self.assertTrue(flac_url.endswith(".flac"))
        self.assertEqual(backend.uploads[0]["mime_type"], "audio/opus")
        self.assertEqual(backend.uploads[1]["mime_type"], "audio/flac")

    def test_missing_file_error_is_clear(self):
        service = PublicAssetService(backend=FakeR2Backend(), cache_db_path=":memory:")
        with self.assertRaisesRegex(FileNotFoundError, "Unable to resolve media input"):
            run(service.ensure_public_url("missing-local-file-does-not-exist.png"))

    def test_upload_failure_is_not_swallowed(self):
        service = PublicAssetService(backend=FakeR2Backend(fail=True), cache_db_path=":memory:")

        with self.assertRaisesRegex(RuntimeError, "mock R2 upload failed"):
            run(service.ensure_public_url(str(FIXTURE_MEDIA)))

    def test_public_asset_storage_tos_uses_tos_backend(self):
        tos_backend = FakeTOSBackend()
        with patch.dict(os.environ, {"PUBLIC_ASSET_STORAGE": "tos"}, clear=False):
            service = PublicAssetService(cache_db_path=":memory:")
            service._backends["tos"] = tos_backend

            url = run(service.ensure_public_url(str(FIXTURE_MEDIA)))

        self.assertTrue(url.startswith("https://public-tos.test/"))
        self.assertEqual(len(tos_backend.uploads), 1)

    def test_storage_provider_tos_overrides_env_r2(self):
        r2_backend = FakeR2Backend()
        tos_backend = FakeTOSBackend()
        with patch.dict(os.environ, {"PUBLIC_ASSET_STORAGE": "r2"}, clear=False):
            service = PublicAssetService(backend=r2_backend, cache_db_path=":memory:")
            service._backends["tos"] = tos_backend

            url = run(service.ensure_public_url(str(FIXTURE_MEDIA), storage_provider="tos"))

        self.assertTrue(url.startswith("https://public-tos.test/"))
        self.assertEqual(r2_backend.uploads, [])
        self.assertEqual(len(tos_backend.uploads), 1)

    def test_storage_provider_r2_overrides_env_tos(self):
        r2_backend = FakeR2Backend()
        tos_backend = FakeTOSBackend()
        with patch.dict(os.environ, {"PUBLIC_ASSET_STORAGE": "tos"}, clear=False):
            service = PublicAssetService(backend=r2_backend, cache_db_path=":memory:")
            service._backends["tos"] = tos_backend

            url = run(service.ensure_public_url(str(FIXTURE_MEDIA), storage_provider="r2"))

        self.assertTrue(url.startswith("https://public-r2.test/"))
        self.assertEqual(len(r2_backend.uploads), 1)
        self.assertEqual(tos_backend.uploads, [])

    def test_tos_missing_required_env_is_clear(self):
        env = {
            "PUBLIC_ASSET_STORAGE": "tos",
            "VOLCENGINE_TOS_ACCESS_KEY_ID": "",
            "VOLCENGINE_TOS_SECRET_ACCESS_KEY": "",
            "VOLCENGINE_TOS_BUCKET_NAME": "",
            "VOLCENGINE_TOS_REGION": "cn-beijing",
            "VOLCENGINE_TOS_ENDPOINT": "tos-cn-beijing.volces.com",
        }
        with patch.dict(os.environ, env, clear=False):
            service = PublicAssetService(cache_db_path=":memory:")

            with self.assertRaisesRegex(ValueError, "Public TOS asset storage is not configured"):
                run(service.ensure_public_url(str(FIXTURE_MEDIA)))

    def test_tos_public_url_uses_custom_domain(self):
        env = {
            "VOLCENGINE_TOS_ACCESS_KEY_ID": "ak",
            "VOLCENGINE_TOS_SECRET_ACCESS_KEY": "sk",
            "VOLCENGINE_TOS_BUCKET_NAME": "bucket",
            "VOLCENGINE_TOS_REGION": "cn-beijing",
            "VOLCENGINE_TOS_ENDPOINT": "tos-cn-beijing.volces.com",
            "VOLCENGINE_TOS_PUBLIC_DOMAIN": "https://cdn.example.test/assets",
        }
        with patch.dict(os.environ, env, clear=False):
            backend = TOSPublicAssetBackend()

        self.assertEqual(
            backend.public_url_for("folder/file.png"),
            "https://cdn.example.test/assets/folder/file.png",
        )

    def test_tos_public_url_uses_bucket_endpoint_without_custom_domain(self):
        env = {
            "VOLCENGINE_TOS_ACCESS_KEY_ID": "ak",
            "VOLCENGINE_TOS_SECRET_ACCESS_KEY": "sk",
            "VOLCENGINE_TOS_BUCKET_NAME": "bucket",
            "VOLCENGINE_TOS_REGION": "cn-beijing",
            "VOLCENGINE_TOS_ENDPOINT": "tos-cn-beijing.volces.com",
            "VOLCENGINE_TOS_PUBLIC_DOMAIN": "",
        }
        with patch.dict(os.environ, env, clear=False):
            backend = TOSPublicAssetBackend()

        self.assertEqual(
            backend.public_url_for("folder/file.png"),
            "https://bucket.tos-cn-beijing.volces.com/folder/file.png",
        )

    def test_tos_endpoint_normalizes_with_and_without_scheme(self):
        base_env = {
            "VOLCENGINE_TOS_ACCESS_KEY_ID": "ak",
            "VOLCENGINE_TOS_SECRET_ACCESS_KEY": "sk",
            "VOLCENGINE_TOS_BUCKET_NAME": "bucket",
            "VOLCENGINE_TOS_REGION": "cn-beijing",
        }
        with patch.dict(os.environ, {**base_env, "VOLCENGINE_TOS_ENDPOINT": "https://tos-cn-beijing.volces.com/"}, clear=False):
            with_scheme = TOSPublicAssetBackend()
        with patch.dict(os.environ, {**base_env, "VOLCENGINE_TOS_ENDPOINT": "tos-cn-beijing.volces.com"}, clear=False):
            without_scheme = TOSPublicAssetBackend()

        self.assertEqual(with_scheme.endpoint_host, "tos-cn-beijing.volces.com")
        self.assertEqual(with_scheme.endpoint, "https://tos-cn-beijing.volces.com")
        self.assertEqual(without_scheme.endpoint_host, "tos-cn-beijing.volces.com")
        self.assertEqual(without_scheme.endpoint, "https://tos-cn-beijing.volces.com")

    def test_local_file_tos_mode_calls_fake_tos_upload(self):
        tos_backend = FakeTOSBackend()
        with patch.dict(os.environ, {"PUBLIC_ASSET_STORAGE": "tos"}, clear=False):
            service = PublicAssetService(cache_db_path=":memory:")
            service._backends["tos"] = tos_backend

            url = run(service.ensure_public_url(str(FIXTURE_MEDIA)))

        self.assertTrue(url.startswith("https://public-tos.test/"))
        self.assertEqual(len(tos_backend.uploads), 1)
        self.assertEqual(tos_backend.uploads[0]["mime_type"], "text/plain")

    def test_unknown_public_asset_storage_errors(self):
        with patch.dict(os.environ, {"PUBLIC_ASSET_STORAGE": "unknown"}, clear=False):
            service = PublicAssetService(backend=FakeR2Backend(), cache_db_path=":memory:")

            with self.assertRaisesRegex(ValueError, "Unsupported public asset storage provider: unknown"):
                run(service.ensure_public_url(str(FIXTURE_MEDIA)))


if __name__ == "__main__":
    unittest.main()
