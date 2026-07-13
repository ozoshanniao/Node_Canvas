import asyncio
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from video_generation.storage import (
    download_video_to_project,
    save_video_bytes_to_project,
)


def run(coro):
    return asyncio.run(coro)


class FakeResponse:
    def __init__(self, *, headers=None, chunks=(), redirect=False):
        self.headers = headers or {}
        self._chunks = chunks
        self.is_redirect = redirect

    def raise_for_status(self):
        return None

    async def aiter_bytes(self):
        for chunk in self._chunks:
            yield chunk


class FakeStream:
    def __init__(self, response):
        self.response = response

    async def __aenter__(self):
        return self.response

    async def __aexit__(self, exc_type, exc, traceback):
        return False


class FakeAsyncClient:
    def __init__(self, responses):
        self.responses = list(responses)
        self.urls = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, traceback):
        return False

    def stream(self, method, url):
        self.urls.append((method, url))
        return FakeStream(self.responses.pop(0))


class VideoStorageTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.project = Path(self.temp_dir.name) / "project"
        self.project.mkdir()

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_invalid_mp4_bytes_leave_no_artifact_or_partial_file(self):
        with self.assertRaisesRegex(ValueError, "not an MP4"):
            save_video_bytes_to_project(
                str(self.project),
                b"not-an-mp4",
                "bad-video",
                validate_mp4=True,
            )

        target = self.project / "generation" / "videos" / "bad-video.mp4"
        self.assertFalse(target.exists())
        self.assertFalse(Path(f"{target}.tmp").exists())

    def test_byte_size_limit_is_enforced_before_writing(self):
        with self.assertRaisesRegex(ValueError, "maximum allowed size"):
            save_video_bytes_to_project(
                str(self.project),
                b"12345",
                "large-video",
                max_bytes=4,
            )
        self.assertFalse((self.project / "generation" / "videos" / "large-video.mp4").exists())

    def test_https_redirect_cannot_downgrade_to_http(self):
        client = FakeAsyncClient([
            FakeResponse(headers={"location": "http://media.invalid/video.mp4"}, redirect=True),
        ])
        with (
            patch("video_generation.storage.httpx.AsyncClient", return_value=client),
            self.assertRaisesRegex(ValueError, "HTTPS"),
        ):
            run(download_video_to_project(
                str(self.project),
                "https://media.invalid/start",
                "redirect-video",
                require_https=True,
                validate_mp4=True,
            ))

        self.assertEqual(client.urls, [("GET", "https://media.invalid/start")])
        target = self.project / "generation" / "videos" / "redirect-video.mp4"
        self.assertFalse(target.exists())
        self.assertFalse(Path(f"{target}.tmp").exists())

    def test_download_size_limit_removes_partial_file(self):
        client = FakeAsyncClient([
            FakeResponse(
                headers={"content-type": "video/mp4"},
                chunks=(b"1234", b"5678"),
            ),
        ])
        with (
            patch("video_generation.storage.httpx.AsyncClient", return_value=client),
            self.assertRaisesRegex(ValueError, "maximum allowed size"),
        ):
            run(download_video_to_project(
                str(self.project),
                "https://media.invalid/video.mp4",
                "large-download",
                require_https=True,
                validate_mp4=True,
                max_bytes=6,
            ))

        target = self.project / "generation" / "videos" / "large-download.mp4"
        self.assertFalse(target.exists())
        self.assertFalse(Path(f"{target}.tmp").exists())

    def test_valid_https_mp4_download_is_atomically_published(self):
        video_bytes = b"\x00\x00\x00\x18ftypmp42downloaded"
        client = FakeAsyncClient([
            FakeResponse(
                headers={
                    "content-type": "video/mp4",
                    "content-length": str(len(video_bytes)),
                },
                chunks=(video_bytes[:10], video_bytes[10:]),
            ),
        ])
        with patch("video_generation.storage.httpx.AsyncClient", return_value=client):
            result = run(download_video_to_project(
                str(self.project),
                "https://media.invalid/video.mp4",
                "valid-download",
                require_https=True,
                validate_mp4=True,
            ))

        target = self.project / "generation" / "videos" / "valid-download.mp4"
        self.assertEqual(result, "/api/video/valid-download.mp4")
        self.assertEqual(target.read_bytes(), video_bytes)
        self.assertFalse(Path(f"{target}.tmp").exists())


if __name__ == "__main__":
    unittest.main()
