import unittest

from media.provider_asset_uploader import ProviderAssetUploadResult
from video_generation.adapters.errors import VideoProviderError

from image_generation.adapters.kie import KieImageAdapter
from image_generation.providers.kie.payloads import (
    KIE_GPT_IMAGE_2_I2I_MODEL,
    KIE_GPT_IMAGE_2_T2I_MODEL,
    KIE_NANO_BANANA_2_MODEL,
    KIE_NANO_BANANA_PRO_MODEL,
    build_kie_image_create_payload,
)
from image_generation.providers.kie.result_parser import (
    extract_kie_image_task_id,
    extract_kie_image_url,
)
from image_generation.schemas import ImageGenerationRequest, ImageInputItem


class FakeKieClient:
    def __init__(self, create_response=None, query_response=None, create_error=None):
        self.create_response = create_response or {"code": 200, "data": {"taskId": "kie-image-task-1"}}
        self.query_response = query_response or {"code": 200, "data": {"state": "generating"}}
        self.create_error = create_error
        self.created_payloads = []

    async def create_task(self, payload):
        self.created_payloads.append(payload)
        if self.create_error:
            raise self.create_error
        return self.create_response

    async def get_task(self, task_id):
        return self.query_response


class FakeAssetRouter:
    def __init__(self):
        self.calls = []

    async def resolve(self, **kwargs):
        self.calls.append(kwargs)
        return ProviderAssetUploadResult(
            provider="kie",
            source_kind="provider_cdn",
            url="https://kie-cdn.test/input.png",
            storage="kie",
        )


class KieImageAdapterTest(unittest.IsolatedAsyncioTestCase):
    async def test_text_to_image_create_payload(self):
        client = FakeKieClient()
        adapter = KieImageAdapter(client=client, asset_router=FakeAssetRouter())
        request = ImageGenerationRequest(
            provider="KIE",
            model=KIE_NANO_BANANA_PRO_MODEL,
            prompt="a quiet studio product photo",
            config={"aspectRatio": "16:9", "resolution": "2K", "useGoogleSearch": True},
            project_path="Z:/project",
        )

        result = await adapter.create(request)

        self.assertEqual(result["task_id"], "kie-image-task-1")
        payload = client.created_payloads[0]
        self.assertEqual(payload["model"], KIE_NANO_BANANA_PRO_MODEL)
        self.assertEqual(payload["input"]["prompt"], "a quiet studio product photo")
        self.assertEqual(payload["input"]["aspect_ratio"], "16:9")
        self.assertEqual(payload["input"]["resolution"], "2K")
        self.assertTrue(payload["input"]["web_search"])
        self.assertNotIn("image_input", payload["input"])

    async def test_gpt_image_2_text_to_image_create_payload(self):
        client = FakeKieClient()
        router = FakeAssetRouter()
        adapter = KieImageAdapter(client=client, asset_router=router)
        request = ImageGenerationRequest(
            provider="KIE",
            model=KIE_GPT_IMAGE_2_T2I_MODEL,
            prompt="a sharp editorial product photo",
            config={"aspectRatio": "16:9", "resolution": "4K"},
            project_path="Z:/project",
        )

        result = await adapter.create(request)

        self.assertEqual(result["task_id"], "kie-image-task-1")
        payload = client.created_payloads[0]
        self.assertEqual(payload["model"], KIE_GPT_IMAGE_2_T2I_MODEL)
        self.assertEqual(payload["input"]["prompt"], "a sharp editorial product photo")
        self.assertEqual(payload["input"]["aspect_ratio"], "16:9")
        self.assertEqual(payload["input"]["resolution"], "4K")
        self.assertNotIn("input_urls", payload["input"])
        self.assertNotIn("image_input", payload["input"])
        self.assertEqual(router.calls, [])

    async def test_gpt_image_2_image_to_image_create_payload(self):
        client = FakeKieClient()
        router = FakeAssetRouter()
        adapter = KieImageAdapter(client=client, asset_router=router)
        request = ImageGenerationRequest(
            provider="KIE",
            model=KIE_GPT_IMAGE_2_I2I_MODEL,
            prompt="turn this into a studio campaign image",
            config={"aspectRatio": "16:9", "resolution": "4K"},
            project_path="Z:/project",
            image_inputs=[ImageInputItem(index=0, url="https://example.test/input.png")],
        )

        result = await adapter.create(request)

        self.assertEqual(result["task_id"], "kie-image-task-1")
        payload = client.created_payloads[0]
        self.assertEqual(payload["model"], KIE_GPT_IMAGE_2_I2I_MODEL)
        self.assertEqual(payload["input"]["prompt"], "turn this into a studio campaign image")
        self.assertEqual(payload["input"]["input_urls"], ["https://kie-cdn.test/input.png"])
        self.assertEqual(payload["input"]["aspect_ratio"], "16:9")
        self.assertEqual(payload["input"]["resolution"], "4K")
        self.assertNotIn("image_input", payload["input"])
        self.assertEqual(router.calls[0]["provider"], "kie")

    async def test_gpt_image_2_image_to_image_uses_input_urls_not_image_input(self):
        client = FakeKieClient()
        adapter = KieImageAdapter(client=client, asset_router=FakeAssetRouter())
        request = ImageGenerationRequest(
            provider="KIE",
            model=KIE_GPT_IMAGE_2_I2I_MODEL,
            prompt="edit",
            config={},
            project_path="Z:/project",
            image_inputs=[ImageInputItem(index=0, url="data:image/png;base64,aW1hZ2U=")],
        )

        await adapter.create(request)

        payload_input = client.created_payloads[0]["input"]
        self.assertIn("input_urls", payload_input)
        self.assertNotIn("image_input", payload_input)

    async def test_image_to_image_uses_provider_asset_upload_router(self):
        client = FakeKieClient()
        router = FakeAssetRouter()
        adapter = KieImageAdapter(client=client, asset_router=router)
        request = ImageGenerationRequest(
            provider="KIE",
            model=KIE_NANO_BANANA_2_MODEL,
            prompt="make it cinematic",
            config={"ratio": "1:1", "resolution": "1K", "useImageSearch": True},
            project_path="Z:/project",
            image_inputs=[ImageInputItem(index=0, url="data:image/png;base64,aW1hZ2U=")],
        )

        await adapter.create(request)

        payload = client.created_payloads[0]
        self.assertEqual(payload["model"], KIE_NANO_BANANA_2_MODEL)
        self.assertEqual(payload["input"]["image_input"], ["https://kie-cdn.test/input.png"])
        self.assertTrue(payload["input"]["image_search"])
        self.assertEqual(router.calls[0]["provider"], "kie")
        self.assertEqual(router.calls[0]["purpose"], "image:in")

    async def test_nano_banana_keeps_image_input_field(self):
        for model in (KIE_NANO_BANANA_PRO_MODEL, KIE_NANO_BANANA_2_MODEL):
            with self.subTest(model=model):
                client = FakeKieClient()
                adapter = KieImageAdapter(client=client, asset_router=FakeAssetRouter())
                request = ImageGenerationRequest(
                    provider="KIE",
                    model=model,
                    prompt="edit",
                    config={"resolution": "1K"},
                    project_path="Z:/project",
                    image_inputs=[ImageInputItem(index=0, url="https://example.test/input.png")],
                )

                await adapter.create(request)

                payload_input = client.created_payloads[0]["input"]
                self.assertIn("image_input", payload_input)
                self.assertNotIn("input_urls", payload_input)

    async def test_display_name_alias_normalizes_to_kie_model_id(self):
        client = FakeKieClient()
        adapter = KieImageAdapter(client=client, asset_router=FakeAssetRouter())
        request = ImageGenerationRequest(
            provider="KIE",
            model="Nano Banana Pro (KIE)",
            prompt="prompt",
            config={"model": "Nano Banana Pro (KIE)"},
            project_path="Z:/project",
        )

        await adapter.create(request)

        self.assertEqual(client.created_payloads[0]["model"], KIE_NANO_BANANA_PRO_MODEL)

    async def test_create_propagates_business_error(self):
        error = VideoProviderError(provider="kie", message="KIE createTask failed: rejected", category="provider_error")
        adapter = KieImageAdapter(client=FakeKieClient(create_error=error), asset_router=FakeAssetRouter())
        request = ImageGenerationRequest(
            provider="KIE",
            model=KIE_NANO_BANANA_PRO_MODEL,
            prompt="prompt",
            config={},
            project_path="Z:/project",
        )

        with self.assertRaisesRegex(VideoProviderError, "rejected"):
            await adapter.create(request)

    async def test_query_running_success_and_failed(self):
        running = KieImageAdapter(
            client=FakeKieClient(query_response={"code": 200, "data": {"state": "generating"}}),
            asset_router=FakeAssetRouter(),
        )
        running_result = await running.query("task-1", model=KIE_NANO_BANANA_PRO_MODEL)
        self.assertEqual(running_result["status"], "running")

        success = KieImageAdapter(
            client=FakeKieClient(query_response={
                "code": 200,
                "data": {"state": "success", "resultJson": '{"resultUrls":["https://x/image.png"]}'},
            }),
            asset_router=FakeAssetRouter(),
        )
        success_result = await success.query("task-1", model=KIE_NANO_BANANA_PRO_MODEL)
        self.assertEqual(success_result["status"], "succeeded")
        self.assertEqual(success_result["image_url"], "https://x/image.png")

        failed = KieImageAdapter(
            client=FakeKieClient(query_response={"code": 200, "data": {"state": "fail", "failMsg": "blocked"}}),
            asset_router=FakeAssetRouter(),
        )
        failed_result = await failed.query("task-1", model=KIE_NANO_BANANA_PRO_MODEL)
        self.assertEqual(failed_result["status"], "failed")
        self.assertEqual(failed_result["message"], "blocked")

    def test_result_parser_fallbacks(self):
        self.assertEqual(extract_kie_image_task_id({"taskId": "top-level"}), "top-level")
        self.assertEqual(extract_kie_image_task_id({"data": {"task_id": "nested"}}), "nested")
        self.assertEqual(
            extract_kie_image_url({"data": {"state": "success", "resultJson": "{broken", "imageUrl": "https://x/fallback.png"}}),
            "https://x/fallback.png",
        )

    def test_gpt_image_2_validation_errors(self):
        with self.assertRaisesRegex(ValueError, "prompt is required"):
            build_kie_image_create_payload(
                model=KIE_GPT_IMAGE_2_T2I_MODEL,
                prompt="",
                task_type="text-to-image",
            )

        with self.assertRaisesRegex(ValueError, "prompt is required"):
            build_kie_image_create_payload(
                model=KIE_GPT_IMAGE_2_I2I_MODEL,
                prompt="",
                task_type="image-to-image",
                image_urls=["https://x/input.png"],
            )

        with self.assertRaisesRegex(ValueError, "20000 characters or fewer"):
            build_kie_image_create_payload(
                model=KIE_GPT_IMAGE_2_T2I_MODEL,
                prompt="x" * 20001,
                task_type="text-to-image",
            )

        with self.assertRaisesRegex(ValueError, "aspect_ratio is not supported"):
            build_kie_image_create_payload(
                model=KIE_GPT_IMAGE_2_T2I_MODEL,
                prompt="prompt",
                task_type="text-to-image",
                params={"aspectRatio": "5:7", "resolution": "1K"},
            )

        with self.assertRaisesRegex(ValueError, "requires at least one input image URL"):
            build_kie_image_create_payload(
                model=KIE_GPT_IMAGE_2_I2I_MODEL,
                prompt="edit",
                task_type="image-to-image",
            )

        with self.assertRaisesRegex(ValueError, "supports at most 16 input images"):
            build_kie_image_create_payload(
                model=KIE_GPT_IMAGE_2_I2I_MODEL,
                prompt="edit",
                task_type="image-to-image",
                image_urls=[f"https://x/{idx}.png" for idx in range(17)],
            )

        with self.assertRaisesRegex(ValueError, "auto aspect_ratio only supports 1K"):
            build_kie_image_create_payload(
                model=KIE_GPT_IMAGE_2_T2I_MODEL,
                prompt="prompt",
                task_type="text-to-image",
                params={"aspectRatio": "auto", "resolution": "2K"},
            )

        with self.assertRaisesRegex(ValueError, "auto aspect_ratio only supports 1K"):
            build_kie_image_create_payload(
                model=KIE_GPT_IMAGE_2_T2I_MODEL,
                prompt="prompt",
                task_type="text-to-image",
                params={"aspectRatio": "auto", "resolution": "4K"},
            )

        with self.assertRaisesRegex(ValueError, "1:1 aspect_ratio does not support 4K"):
            build_kie_image_create_payload(
                model=KIE_GPT_IMAGE_2_T2I_MODEL,
                prompt="prompt",
                task_type="text-to-image",
                params={"aspectRatio": "1:1", "resolution": "4K"},
            )

    def test_gpt_image_2_validation_allows_supported_resolution_combinations(self):
        square_2k = build_kie_image_create_payload(
            model=KIE_GPT_IMAGE_2_T2I_MODEL,
            prompt="prompt",
            task_type="text-to-image",
            params={"aspectRatio": "1:1", "resolution": "2K"},
        )
        self.assertEqual(square_2k["input"]["resolution"], "2K")

        auto_1k = build_kie_image_create_payload(
            model=KIE_GPT_IMAGE_2_T2I_MODEL,
            prompt="prompt",
            task_type="text-to-image",
            params={"aspectRatio": "auto", "resolution": "1K"},
        )
        self.assertEqual(auto_1k["input"]["aspect_ratio"], "auto")

        wide_4k = build_kie_image_create_payload(
            model=KIE_GPT_IMAGE_2_I2I_MODEL,
            prompt="prompt",
            task_type="image-to-image",
            params={"aspectRatio": "16:9", "resolution": "4K"},
            image_urls=["https://x/input.png"],
        )
        self.assertEqual(wide_4k["input"]["resolution"], "4K")


if __name__ == "__main__":
    unittest.main()
