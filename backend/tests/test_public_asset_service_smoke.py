import os
import unittest
from pathlib import Path

from media.public_asset_service import PublicAssetService

from tests.test_public_asset_service import run


@unittest.skipUnless(
    os.getenv("NODE_CANVAS_RUN_R2_SMOKE") == "1",
    "Skipping real R2 smoke test because NODE_CANVAS_RUN_R2_SMOKE is not set.",
)
class PublicAssetServiceR2SmokeTest(unittest.TestCase):
    def test_real_r2_upload_smoke(self):
        fixture = Path(__file__).resolve().parent / "fixtures" / "public_asset_project" / "input" / "seedance-r2-smoke.txt"
        service = PublicAssetService(cache_db_path=":memory:")

        url = run(service.ensure_public_url(str(fixture), storage_provider="r2"))

        self.assertTrue(url.startswith("http"))


if __name__ == "__main__":
    unittest.main()
