import unittest

from media.provider_asset_uploader import ProviderAssetUploadResult
from video_generation.adapters.errors import VideoProviderError

from image_generation.adapters.kie import KieImageAdapter
from image_generation.providers.kie.payloads import (
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

    def test_payload_rejects_unknown_gpt_image_2(self):
        with self.assertRaisesRegex(ValueError, "Unsupported KIE image model"):
            build_kie_image_create_payload(
                model="gpt-image-2",
                prompt="prompt",
                task_type="text-to-image",
            )


if __name__ == "__main__":
    unittest.main()
