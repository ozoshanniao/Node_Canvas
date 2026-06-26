import asyncio
import unittest

from video_generation.providers.kling.omni_payloads import KlingOmniPayloadBuilder
from video_generation.schemas import VideoGenerateRequest


def run(coro):
    return asyncio.run(coro)


async def passthrough_image_resolution(self, image_ref, project_path):
    return image_ref


class KlingOmniRuntimeReferencesTest(unittest.TestCase):
    def setUp(self):
        self.original_resolver = KlingOmniPayloadBuilder.resolve_image_for_kling
        KlingOmniPayloadBuilder.resolve_image_for_kling = passthrough_image_resolution

    def tearDown(self):
        KlingOmniPayloadBuilder.resolve_image_for_kling = self.original_resolver

    def test_omni_images_resolve_from_runtime_request_images(self):
        request = VideoGenerateRequest(
            provider="kling",
            model="kling-v3-omni",
            videoMode="omni-video",
            prompt="",
            images=["https://example.test/a.png", "https://example.test/b.png"],
            customParams={
                "kling": {
                    "omniParams": {
                        "prompt": "Use @image_1 then @image_2.",
                        "images": [
                            {"alias": "image_1", "index": 0, "role": "reference"},
                            {"alias": "image_2", "index": 1, "role": "reference"},
                        ],
                        "elements": [],
                    }
                }
            },
        )

        payload = run(KlingOmniPayloadBuilder().build_omni_payload(request, None))

        self.assertEqual(payload["image_list"], [
            {"image_url": "https://example.test/a.png"},
            {"image_url": "https://example.test/b.png"},
        ])

    def test_raw_url_keys_and_invalid_index_are_rejected_without_value_echo(self):
        builder = KlingOmniPayloadBuilder()
        base = VideoGenerateRequest(
            provider="kling",
            model="kling-v3-omni",
            videoMode="omni-video",
            prompt="",
            images=["https://example.test/a.png"],
            customParams={
                "kling": {
                    "omniParams": {
                        "prompt": "Use @image_1.",
                        "images": [{"alias": "image_1", "index": 0, "role": "reference"}],
                        "elements": [],
                    }
                }
            },
        )

        for key in ("url", "uri", "path", "endpoint", "token", "key"):
            request = base.model_copy(deep=True)
            request.customParams["kling"]["omniParams"]["images"] = [
                {"alias": "image_1", "index": 0, key: "https://secret.example/raw.png?token=x"}
            ]
            with self.assertRaises(ValueError) as context:
                run(builder.build_omni_payload(request, None))
            message = str(context.exception)
            self.assertIn("obsolete", message)
            self.assertNotIn("secret.example", message)

        for index in (None, True, -1, 1):
            request = base.model_copy(deep=True)
            request.customParams["kling"]["omniParams"]["images"] = [
                {"alias": "image_1", "index": index, "role": "reference"}
            ]
            with self.assertRaisesRegex(ValueError, "index|unavailable"):
                run(builder.build_omni_payload(request, None))


if __name__ == "__main__":
    unittest.main()
