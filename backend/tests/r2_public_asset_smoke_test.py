# -*- coding: utf-8 -*-
# 这是一个真实的 API / R2 冒烟测试脚本 (Smoke Test)
# 默认不要自动运行此脚本，它不应该被包含在 python -m unittest 的自动测试中。
# 如需手动运行，请确保配置了 .env 环境，然后在 backend 目录下运行：
# python -m tests.r2_public_asset_smoke_test [--real-r2]
import argparse
import asyncio
from pathlib import Path

import httpx
from dotenv import load_dotenv

from media.public_asset_service import PublicAssetService


class MockR2Backend:
    def __init__(self):
        self.uploads = []

    async def upload(self, storage_key, raw_data, mime_type):
        self.uploads.append({
            "storage_key": storage_key,
            "raw_data": raw_data,
            "mime_type": mime_type,
        })
        return f"https://mock-r2.local/{storage_key}"


async def run_smoke(real_r2: bool) -> None:
    load_dotenv()

    media_path = Path(__file__).resolve().parent / "fixtures" / "public_asset_project" / "input" / "seedance-r2-smoke.txt"
    backend = None if real_r2 else MockR2Backend()
    service = PublicAssetService(backend=backend, cache_db_path=":memory:")
    public_url = await service.ensure_public_url(str(media_path))
    cached_url = await service.ensure_public_url(str(media_path))

    print(f"mode={'real-r2' if real_r2 else 'mock'}")
    print(f"public_url={public_url}")
    print(f"cache_reused={public_url == cached_url}")

    if not real_r2:
        upload = backend.uploads[0]
        print(f"storage_key={upload['storage_key']}")
        print(f"content_type={upload['mime_type']}")
        print("real_r2_upload=false")
        return

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(public_url)
    print(f"public_get_status={response.status_code}")
    print("real_r2_upload=true")
    print("delete_note=R2 lifecycle should delete this object after 5 days; you may also remove it manually in the R2 console.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Seedance PublicAssetService R2 smoke test. Defaults to mock mode.")
    parser.add_argument(
        "--real-r2",
        action="store_true",
        help="Upload one tiny text file to the configured Cloudflare R2 bucket and check public GET access.",
    )
    args = parser.parse_args()

    if args.real_r2:
        print("This will perform one tiny R2 PUT and one public GET. It does not call Ark or generate video.")

    asyncio.run(run_smoke(args.real_r2))


if __name__ == "__main__":
    main()
