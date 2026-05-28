import unittest
from pathlib import Path

from fastapi.testclient import TestClient

import main


FIXTURE_ROOT = Path(__file__).resolve().parent / "fixtures" / "public_asset_project"


class InputMediaEndpointTest(unittest.TestCase):
    def test_audio_input_endpoint_returns_audio_content_type(self):
        client = TestClient(main.app)
        response = client.get(
            "/api/input/voice.opus",
            params={"projectPath": str(FIXTURE_ROOT)},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["content-type"], "audio/opus")

    def test_input_content_type_fallbacks_cover_audio_formats(self):
        self.assertEqual(main.guess_input_content_type("track.mp3"), "audio/mpeg")
        self.assertEqual(main.guess_input_content_type("track.wav"), "audio/wav")
        self.assertEqual(main.guess_input_content_type("track.m4a"), "audio/mp4")
        self.assertEqual(main.guess_input_content_type("track.aac"), "audio/aac")
        self.assertEqual(main.guess_input_content_type("track.ogg"), "audio/ogg")
        self.assertEqual(main.guess_input_content_type("track.opus"), "audio/opus")
        self.assertEqual(main.guess_input_content_type("track.flac"), "audio/flac")
        self.assertEqual(main.guess_input_content_type("track.webm"), "audio/webm")
        self.assertEqual(main.guess_input_content_type("track.mp4"), "audio/mp4")


if __name__ == "__main__":
    unittest.main()

