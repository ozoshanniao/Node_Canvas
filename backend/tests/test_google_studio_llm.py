import asyncio
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from llm.image_inputs import PreparedLLMImageInput
from llm.providers.base import LLMProviderError
from llm.providers.google_studio_provider import GoogleStudioLLMProvider
from llm.schemas import LLMGenerateRequest


def run(coro):
    return asyncio.run(coro)


FAKE_IMAGE = PreparedLLMImageInput(
    index=0,
    mime_type="image/png",
    raw_data=b"fake-image",
    base64_data="ZmFrZS1pbWFnZQ==",
    original_url="input/ref.png",
)


class FakePart:
    @staticmethod
    def from_bytes(data, mime_type):
        return {"kind": "bytes", "data": data, "mime_type": mime_type}

    @staticmethod
    def from_text(text):
        return {"kind": "text", "text": text}


class FakeContent:
    def __init__(self, role, parts):
        self.role = role
        self.parts = parts


class FakeConfig:
    def __init__(self, **kwargs):
        self.kwargs = kwargs


class FakeModels:
    def __init__(self, response=None, error=None):
        self.response = response or SimpleNamespace(text="ok")
        self.error = error
        self.calls = []

    def generate_content(self, **kwargs):
        self.calls.append(kwargs)
        if self.error:
            raise self.error
        return self.response


class FakeClient:
    def __init__(self, response=None, error=None):
        self.models = FakeModels(response=response, error=error)


class GoogleStudioLLMProviderTest(unittest.TestCase):
    def setUp(self):
        self.types_patch = patch.multiple(
            "llm.providers.google_studio_provider.types",
            Part=FakePart,
            Content=FakeContent,
            GenerateContentConfig=FakeConfig,
        )
        self.types_patch.start()
        self.resolver_patch = patch("llm.providers.google_studio_provider.resolve_google_studio_api_key", return_value=None)
        self.resolver_patch.start()

    def tearDown(self):
        self.resolver_patch.stop()
        self.types_patch.stop()

    def test_text_payload_system_temperature_and_max_tokens(self):
        client = FakeClient(SimpleNamespace(text="Final answer"))
        provider = GoogleStudioLLMProvider(api_key="studio-key", client=client)

        text = run(provider.generate(LLMGenerateRequest(
            provider="google_studio",
            model="gemini-3.5-flash",
            inputText="Hello",
            systemPrompt="Be terse",
            temperature=0.3,
            maxTokens=123,
        )))

        self.assertEqual(text, "Final answer")
        call = client.models.calls[0]
        self.assertEqual(call["model"], "gemini-3.5-flash")
        self.assertEqual(call["contents"][0].role, "user")
        self.assertEqual(call["contents"][0].parts, [{"kind": "text", "text": "Hello"}])
        self.assertEqual(call["config"].kwargs["system_instruction"], "Be terse")
        self.assertEqual(call["config"].kwargs["temperature"], 0.3)
        self.assertEqual(call["config"].kwargs["max_output_tokens"], 123)
        self.assertNotIn("stream", call)

    def test_image_bytes_are_converted_to_parts(self):
        client = FakeClient(SimpleNamespace(text="vision"))
        provider = GoogleStudioLLMProvider(api_key="studio-key", client=client)
        with patch("llm.providers.google_studio_provider.prepare_llm_image_inputs", return_value=[FAKE_IMAGE]):
            text = run(provider.generate(LLMGenerateRequest(
                provider="google_studio",
                model="gemini-3.1-pro-preview",
                inputText="Describe",
                imageInputs=[{"index": 0, "url": "input/ref.png"}],
            )))

        self.assertEqual(text, "vision")
        parts = client.models.calls[0]["contents"][0].parts
        self.assertEqual(parts[0], {"kind": "bytes", "data": b"fake-image", "mime_type": "image/png"})
        self.assertEqual(parts[1]["kind"], "text")

    def test_remote_image_url_is_rejected_without_calling_client(self):
        client = FakeClient()
        provider = GoogleStudioLLMProvider(api_key="studio-key", client=client)

        with self.assertRaisesRegex(LLMProviderError, "Google Studio: remote image URLs"):
            run(provider.generate(LLMGenerateRequest(
                provider="google_studio",
                model="gemini-3.5-flash",
                inputText="Describe",
                imageInputs=[{"index": 0, "url": "https://example.test/a.png"}],
            )))
        self.assertEqual(client.models.calls, [])

    def test_client_initialization_uses_only_api_key(self):
        made_clients = []

        class ClientFactory:
            def __call__(self, **kwargs):
                made_clients.append(kwargs)
                return FakeClient(SimpleNamespace(text="ok"))

        with patch("llm.providers.google_studio_provider.resolve_google_studio_api_key", return_value="resolved-key"), \
             patch("llm.providers.google_studio_provider.genai.Client", ClientFactory()):
            text = run(GoogleStudioLLMProvider().generate(LLMGenerateRequest(
                provider="google_studio",
                model="gemini-3.1-flash-lite",
                inputText="Hi",
            )))

        self.assertEqual(text, "ok")
        self.assertEqual(made_clients, [{"api_key": "resolved-key"}])
        self.assertNotIn("vertexai", made_clients[0])
        self.assertNotIn("project", made_clients[0])
        self.assertNotIn("location", made_clients[0])

    def test_response_parts_are_joined_when_text_property_is_missing(self):
        response = SimpleNamespace(
            text=None,
            candidates=[SimpleNamespace(content=SimpleNamespace(parts=[SimpleNamespace(text="A"), SimpleNamespace(text="B")]))],
        )
        provider = GoogleStudioLLMProvider(api_key="studio-key", client=FakeClient(response))

        text = run(provider.generate(LLMGenerateRequest(provider="google_studio", model="gemini-3.5-flash", inputText="Hi")))

        self.assertEqual(text, "AB")

    def test_empty_text_response_is_safe_error(self):
        response = SimpleNamespace(text=None, candidates=[])
        provider = GoogleStudioLLMProvider(api_key="studio-key", client=FakeClient(response))

        with self.assertRaisesRegex(LLMProviderError, "Google Studio: response did not include text output"):
            run(provider.generate(LLMGenerateRequest(provider="google_studio", model="gemini-3.5-flash", inputText="Hi")))

    def test_sdk_exception_is_normalized_and_redacts_key(self):
        provider = GoogleStudioLLMProvider(api_key="dummy-key", client=FakeClient(error=RuntimeError("bad dummy-key")))

        with self.assertRaisesRegex(LLMProviderError, r"Google Studio: bad \[redacted\]"):
            run(provider.generate(LLMGenerateRequest(provider="google_studio", model="gemini-3.5-flash", inputText="Hi")))

    def test_unsupported_model_is_rejected(self):
        client = FakeClient()
        provider = GoogleStudioLLMProvider(api_key="studio-key", client=client)

        with self.assertRaisesRegex(LLMProviderError, "Google Studio: unsupported model: gemini-unknown"):
            run(provider.generate(LLMGenerateRequest(provider="google_studio", model="gemini-unknown", inputText="Hi")))
        self.assertEqual(client.models.calls, [])


if __name__ == "__main__":
    unittest.main()
