import asyncio
import os
import unittest
from pathlib import Path
from unittest.mock import patch

from media.public_asset_service import PublicAssetService, R2PublicAssetBackend


def run(coro):
    return asyncio.run(coro)


FIXTURE_ROOT = Path(__file__).resolve().parent / "fixtures" / "public_asset_project"
FIXTURE_MEDIA = FIXTURE_ROOT / "input" / "seedance-r2-smoke.txt"
FIXTURE_API_IMAGE = FIXTURE_ROOT / "generation" / "frame.png"


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

    def test_missing_file_error_is_clear(self):
        service = PublicAssetService(backend=FakeR2Backend(), cache_db_path=":memory:")
        with self.assertRaisesRegex(FileNotFoundError, "Unable to resolve media input"):
            run(service.ensure_public_url("missing-local-file-does-not-exist.png"))

    def test_upload_failure_is_not_swallowed(self):
        service = PublicAssetService(backend=FakeR2Backend(fail=True), cache_db_path=":memory:")

        with self.assertRaisesRegex(RuntimeError, "mock R2 upload failed"):
            run(service.ensure_public_url(str(FIXTURE_MEDIA)))


if __name__ == "__main__":
    unittest.main()
