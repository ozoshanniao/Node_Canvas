import base64
import os
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from engines.image_utils import NormalizedImageInput
from image_generation.adapters.google_studio_native_image_adapter import GoogleStudioNativeImageAdapter
from image_generation.providers.google_studio_provider import GoogleStudioImageProvider
from image_generation.schemas import ImageGenerationRequest, ImageInputItem
from image_generation.service import ImageGenerationService
from settings_resolver import resolve_google_studio_api_key


class FakeSettingsStore:
    def __init__(self, providers=None):
        self.providers = providers or {}

    def get_provider(self, provider_id):
        return dict(self.providers.get(provider_id, {}))


class FakeInteractions:
    def __init__(self, response=None, error=None):
        self.response = response or SimpleNamespace(output_image=SimpleNamespace(data=base64.b64encode(b"image-bytes").decode("ascii"), mime_type="image/png"))
        self.error = error
        self.calls = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        if self.error:
            raise self.error
        return self.response


class FakeClient:
    def __init__(self, response=None, error=None):
        self.interactions = FakeInteractions(response=response, error=error)


FAKE_IMAGE = NormalizedImageInput(
    source_type="base64",
    mime_type="image/png",
    raw_data=b"input-image",
    base64_data=base64.b64encode(b"input-image").decode("ascii"),
    filename="input.png",
)


def request(**overrides):
    data = {
        "provider": "google_studio",
        "model": "gemini-3-pro-image",
        "prompt": "make a product photo",
        "config": {"ratio": "16:9", "resolution": "2K", "outputFormat": "jpeg"},
        "project_path": "Z:/project",
        "generation_dir": "Z:/project/generation",
        "image_inputs": [],
    }
    data.update(overrides)
    return ImageGenerationRequest(**data)


class GoogleStudioImageProviderTest(unittest.IsolatedAsyncioTestCase):
    def test_resolver_precedence_is_shared_with_google_studio(self):
        store = FakeSettingsStore({"google_studio": {"apiKey": "settings-studio"}})
        with patch.dict(os.environ, {"GOOGLE_API_KEY": "env-google", "GEMINI_API_KEY": "env-gemini"}, clear=False):
            self.assertEqual(resolve_google_studio_api_key(store), "env-google")
        with patch.dict(os.environ, {"GOOGLE_API_KEY": "", "GEMINI_API_KEY": "env-gemini"}, clear=False):
            self.assertEqual(resolve_google_studio_api_key(store), "env-gemini")
        with patch.dict(os.environ, {"GOOGLE_API_KEY": "", "GEMINI_API_KEY": "", "GOOGLE_CLOUD_API_KEY": "cloud-only"}, clear=False):
            self.assertEqual(resolve_google_studio_api_key(store), "settings-studio")

    def test_missing_key_uses_safe_google_studio_error(self):
        with patch("image_generation.providers.google_studio_provider.resolve_google_studio_api_key", return_value=None):
            with self.assertRaisesRegex(ValueError, "Google Studio: API key is missing"):
                GoogleStudioImageProvider()

    async def test_client_initialization_uses_only_api_key(self):
        made_clients = []

        class ClientFactory:
            def __call__(self, **kwargs):
                made_clients.append(kwargs)
                return FakeClient()

        with patch("image_generation.providers.google_studio_provider.resolve_google_studio_api_key", return_value="resolved-key"), \
             patch("image_generation.adapters.google_studio_native_image_adapter.genai.Client", ClientFactory()), \
             patch("image_generation.adapters.google_studio_native_image_adapter.save_image_bytes", return_value="/api/image/studio.png"):
            provider = GoogleStudioImageProvider()
            result = await provider.generate(request())

        self.assertEqual(result, "/api/image/studio.png")
        self.assertEqual(made_clients, [{"api_key": "resolved-key"}])
        self.assertNotIn("vertexai", made_clients[0])
        self.assertNotIn("project", made_clients[0])
        self.assertNotIn("location", made_clients[0])

    async def test_pro_text_to_image_payload(self):
        client = FakeClient()
        adapter = GoogleStudioNativeImageAdapter(api_key="studio-key", client=client)
        with patch("image_generation.adapters.google_studio_native_image_adapter.save_image_bytes", return_value="/api/image/studio.jpg"):
            result = await adapter.generate(request(), "gemini-3-pro-image")

        self.assertEqual(result, "/api/image/studio.jpg")
        call = client.interactions.calls[0]
        self.assertEqual(call["model"], "gemini-3-pro-image")
        self.assertEqual(call["input"], "make a product photo")
        self.assertEqual(call["response_format"], {
            "type": "image",
            "aspect_ratio": "16:9",
            "image_size": "2K",
            "mime_type": "image/jpeg",
        })
        self.assertNotIn("stream", call)
        self.assertNotIn("tools", call)
        self.assertNotIn("previous_interaction_id", call)

    async def test_nano_banana_2_allows_half_k_and_extended_ratio(self):
        client = FakeClient()
        adapter = GoogleStudioNativeImageAdapter(api_key="studio-key", client=client)
        with patch("image_generation.adapters.google_studio_native_image_adapter.save_image_bytes", return_value="/api/image/studio.png"):
            await adapter.generate(request(model="gemini-3.1-flash-image", config={"aspectRatio": "8:1", "resolution": "0.5K"}), "gemini-3.1-flash-image")

        response_format = client.interactions.calls[0]["response_format"]
        self.assertEqual(response_format["aspect_ratio"], "8:1")
        self.assertEqual(response_format["image_size"], "0.5K")
        self.assertEqual(response_format["mime_type"], "image/png")

    async def test_single_image_to_image_payload_uses_base64_without_data_url_prefix(self):
        client = FakeClient()
        adapter = GoogleStudioNativeImageAdapter(api_key="studio-key", client=client)
        with patch("image_generation.adapters.google_studio_native_image_adapter.prepare_provider_image_input", return_value=FAKE_IMAGE), \
             patch("image_generation.adapters.google_studio_native_image_adapter.save_image_bytes", return_value="/api/image/studio.png"):
            await adapter.generate(request(image_inputs=[ImageInputItem(index=0, url="input/ref.png")]), "gemini-3-pro-image")

        payload = client.interactions.calls[0]["input"]
        self.assertEqual(payload[0], {"type": "text", "text": "make a product photo"})
        self.assertEqual(payload[1]["type"], "image")
        self.assertEqual(payload[1]["data"], FAKE_IMAGE.base64_data)
        self.assertFalse(payload[1]["data"].startswith("data:image/"))
        self.assertEqual(payload[1]["mime_type"], "image/png")

    async def test_multi_image_order_and_limit(self):
        client = FakeClient()
        adapter = GoogleStudioNativeImageAdapter(api_key="studio-key", client=client)
        inputs = [ImageInputItem(index=2, url="input/2.png"), ImageInputItem(index=0, url="input/0.png"), ImageInputItem(index=1, url="input/1.png")]
        prepared = [NormalizedImageInput("base64", "image/png", b"0", "MA=="), NormalizedImageInput("base64", "image/png", b"1", "MQ=="), NormalizedImageInput("base64", "image/png", b"2", "Mg==")]
        with patch("image_generation.adapters.google_studio_native_image_adapter.prepare_provider_image_input", side_effect=prepared), \
             patch("image_generation.adapters.google_studio_native_image_adapter.save_image_bytes", return_value="/api/image/studio.png"):
            await adapter.generate(request(image_inputs=inputs), "gemini-3-pro-image")

        self.assertEqual([part["data"] for part in client.interactions.calls[0]["input"][1:]], ["MA==", "MQ==", "Mg=="])

        too_many = [ImageInputItem(index=index, url=f"input/{index}.png") for index in range(15)]
        client = FakeClient()
        adapter = GoogleStudioNativeImageAdapter(api_key="studio-key", client=client)
        with self.assertRaisesRegex(RuntimeError, "Google Studio: Google Studio supports at most 14 input images"):
            await adapter.generate(request(image_inputs=too_many), "gemini-3-pro-image")
        self.assertEqual(client.interactions.calls, [])

    async def test_remote_url_is_rejected_before_sdk_call(self):
        client = FakeClient()
        adapter = GoogleStudioNativeImageAdapter(api_key="studio-key", client=client)
        with self.assertRaisesRegex(RuntimeError, "Google Studio: remote image URLs"):
            await adapter.generate(request(image_inputs=[ImageInputItem(index=0, url="https://example.test/ref.png")]), "gemini-3-pro-image")
        self.assertEqual(client.interactions.calls, [])

    async def test_output_image_is_decoded_and_saved(self):
        response = SimpleNamespace(output_image=SimpleNamespace(data=base64.b64encode(b"saved-image").decode("ascii"), mime_type="image/jpeg"))
        client = FakeClient(response=response)
        adapter = GoogleStudioNativeImageAdapter(api_key="studio-key", client=client)
        calls = []

        def fake_save(image_bytes, generation_dir, prefix, mime_type):
            calls.append((image_bytes, generation_dir, prefix, mime_type))
            return "/api/image/studio.jpg"

        with patch("image_generation.adapters.google_studio_native_image_adapter.save_image_bytes", fake_save):
            result = await adapter.generate(request(), "gemini-3-pro-image")

        self.assertEqual(result, "/api/image/studio.jpg")
        self.assertEqual(calls, [(b"saved-image", "Z:/project/generation", "google_studio", "image/jpeg")])

    async def test_steps_fallback_can_extract_image(self):
        response = SimpleNamespace(output_image=None, steps=[{"content": [{"type": "text", "text": "x"}, {"type": "image", "data": base64.b64encode(b"step-image").decode("ascii"), "mime_type": "image/png"}]}])
        adapter = GoogleStudioNativeImageAdapter(api_key="studio-key", client=FakeClient(response=response))
        with patch("image_generation.adapters.google_studio_native_image_adapter.save_image_bytes", return_value="/api/image/step.png") as save:
            result = await adapter.generate(request(), "gemini-3-pro-image")

        self.assertEqual(result, "/api/image/step.png")
        self.assertEqual(save.call_args.args[0], b"step-image")

    async def test_no_image_output_is_safe_error(self):
        adapter = GoogleStudioNativeImageAdapter(api_key="studio-key", client=FakeClient(response=SimpleNamespace(output_image=None, steps=[])))
        with self.assertRaisesRegex(RuntimeError, "Google Studio: no image output returned"):
            await adapter.generate(request(), "gemini-3-pro-image")

    async def test_sdk_exception_is_prefixed_and_redacts_key(self):
        adapter = GoogleStudioNativeImageAdapter(api_key="dummy-key", client=FakeClient(error=RuntimeError("bad dummy-key")))
        with self.assertRaisesRegex(RuntimeError, r"Google Studio: bad \[redacted\]"):
            await adapter.generate(request(), "gemini-3-pro-image")

    async def test_unsupported_model_is_rejected_before_call(self):
        provider = GoogleStudioImageProvider(api_key="studio-key", client=FakeClient())
        with self.assertRaisesRegex(ValueError, "Google Studio: unsupported image model"):
            await provider.generate(request(model="gemini-2.5-flash-image"))

    async def test_service_dispatches_google_studio_without_affecting_google_or_kie(self):
        calls = []

        class FakeStudioProvider:
            async def generate(self, req):
                calls.append(req.provider)
                return "/api/image/studio.png"

        service = ImageGenerationService(engines={})
        with patch("image_generation.service.GoogleStudioImageProvider", return_value=FakeStudioProvider()), \
             patch("image_generation.service.ensure_generation_dir", return_value="Z:/project/generation"):
            result = await service.generate(request(generation_dir=None))

        self.assertEqual(calls, ["google_studio"])
        self.assertEqual(result.url, "http://127.0.0.1:8000/api/image/studio.png")


class GoogleStudioImageSpecsTest(unittest.TestCase):
    def test_specs_include_studio_models_without_changing_kie(self):
        from engines.specs import get_frontend_specs

        specs = get_frontend_specs()
        self.assertEqual(specs["providers"]["google_studio"], ["gemini-3-pro-image", "gemini-3.1-flash-image"])
        self.assertEqual(specs["models"]["gemini-3-pro-image"]["label"], "Nano Banana Pro")
        self.assertEqual(specs["models"]["gemini-3.1-flash-image"]["label"], "Nano Banana 2")
        self.assertEqual(specs["models"]["gemini-3.1-flash-image"]["resolutions"], ["0.5K", "1K", "2K", "4K"])
        self.assertEqual(specs["providers"]["KIE"], ["Nano Banana Pro (KIE)", "Nano Banana 2 (KIE)", "GPT Image 2 (KIE)"])
        self.assertEqual(specs["models"]["Nano Banana Pro (KIE)"]["id"], "nano-banana-pro")
        self.assertNotIn("gemini-3-pro-image-preview", specs["providers"]["google_studio"])
        self.assertNotIn("gemini-3.1-flash-image-preview", specs["providers"]["google_studio"])


if __name__ == "__main__":
    unittest.main()
