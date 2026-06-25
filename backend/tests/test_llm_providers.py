import asyncio
import unittest
from unittest.mock import patch

from llm.image_inputs import PreparedLLMImageInput
from llm.providers.anthropic_provider import AnthropicLLMProvider
from llm.providers.base import LLMProviderError
from llm.providers.openai_provider import OpenAILLMProvider
from llm.schemas import LLMGenerateRequest
from provider_base_url import normalize_provider_base_url


def run(coro):
    return asyncio.run(coro)


class FakeResponse:
    def __init__(self, payload, status_code=200, text=None):
        self._payload = payload
        self.status_code = status_code
        self.text = str(payload) if text is None else text

    def json(self):
        return self._payload


class FakeClient:
    def __init__(self, response):
        self.response = response
        self.calls = []

    async def post(self, url, headers=None, json=None):
        self.calls.append({"url": url, "headers": headers, "json": json})
        return self.response


FAKE_IMAGE = PreparedLLMImageInput(
    index=0,
    mime_type="image/png",
    raw_data=b"fake",
    base64_data="ZmFrZQ==",
    original_url="input/ref.png",
)


class OpenAILLMProviderTest(unittest.TestCase):
    def setUp(self):
        self.secret_patch = patch("llm.providers.openai_provider.resolve_provider_secret", return_value=None)
        self.secret_patch.start()

    def tearDown(self):
        self.secret_patch.stop()

    def test_text_payload_and_response_parsing(self):
        client = FakeClient(FakeResponse({"output_text": "Final answer"}))
        provider = OpenAILLMProvider(api_key="test-key", client=client)

        text = run(provider.generate(LLMGenerateRequest(provider="openai", model="gpt-5.5", inputText="Hello", maxTokens=100)))

        self.assertEqual(text, "Final answer")
        call = client.calls[0]
        self.assertEqual(call["url"], "https://api.openai.com/v1/responses")
        self.assertEqual(call["headers"]["Authorization"], "Bearer test-key")
        self.assertEqual(call["json"]["model"], "gpt-5.5")
        self.assertEqual(call["json"]["input"][0]["content"], [{"type": "input_text", "text": "Hello"}])
        self.assertEqual(call["json"]["max_output_tokens"], 100)
        self.assertNotIn("stream", call["json"])

    def test_system_prompt_maps_to_instructions(self):
        client = FakeClient(FakeResponse({"output_text": "ok"}))
        provider = OpenAILLMProvider(api_key="test-key", client=client)

        run(provider.generate(LLMGenerateRequest(provider="openai", model="gpt-5.4-mini", inputText="Hi", systemPrompt="Be terse")))

        self.assertEqual(client.calls[0]["json"]["instructions"], "Be terse")

    def test_image_data_url_payload(self):
        client = FakeClient(FakeResponse({"output": [{"content": [{"type": "output_text", "text": "vision"}]}]}))
        provider = OpenAILLMProvider(api_key="test-key", client=client)
        with patch("llm.providers.openai_provider.prepare_llm_image_inputs", return_value=[FAKE_IMAGE]):
            text = run(provider.generate(LLMGenerateRequest(provider="openai", model="gpt-5.4-nano", inputText="Describe", imageInputs=[{"index": 0, "url": "input/ref.png"}])))

        self.assertEqual(text, "vision")
        content = client.calls[0]["json"]["input"][0]["content"]
        self.assertEqual(content[1], {"type": "input_image", "image_url": "data:image/png;base64,ZmFrZQ=="})

    def test_error_is_normalized_and_redacts_key(self):
        client = FakeClient(FakeResponse({}, status_code=401, text="bad test-key"))
        provider = OpenAILLMProvider(api_key="test-key", client=client)

        with self.assertRaisesRegex(LLMProviderError, r"OpenAI: bad \[redacted\]"):
            run(provider.generate(LLMGenerateRequest(provider="openai", model="gpt-5.5", inputText="Hello")))

    def test_base_url_validation(self):
        self.assertEqual(normalize_provider_base_url("https://api.openai.com/v1/"), "https://api.openai.com/v1")
        with self.assertRaises(ValueError):
            normalize_provider_base_url("ftp://example.test")
        with self.assertRaises(ValueError):
            normalize_provider_base_url("https://user:pass@example.test")
        with self.assertRaises(ValueError):
            normalize_provider_base_url("http://127.0.0.1:8000/v1")
        with patch.dict("os.environ", {"NODE_CANVAS_ALLOW_PRIVATE_PROVIDER_BASE_URLS": "1"}, clear=False):
            self.assertEqual(normalize_provider_base_url("http://127.0.0.1:8000/v1/"), "http://127.0.0.1:8000/v1")

    def test_rejects_remote_image_urls_without_calling_client(self):
        client = FakeClient(FakeResponse({"output_text": "unused"}))
        provider = OpenAILLMProvider(api_key="test-key", client=client)

        with self.assertRaisesRegex(LLMProviderError, "remote image URLs"):
            run(provider.generate(LLMGenerateRequest(provider="openai", model="gpt-5.5", inputText="Describe", imageInputs=[{"index": 0, "url": "https://example.test/a.png"}])))
        self.assertEqual(client.calls, [])


class AnthropicLLMProviderTest(unittest.TestCase):
    def setUp(self):
        self.secret_patch = patch("llm.providers.anthropic_provider.resolve_provider_secret", return_value=None)
        self.secret_patch.start()

    def tearDown(self):
        self.secret_patch.stop()

    def test_text_messages_payload(self):
        client = FakeClient(FakeResponse({"content": [{"type": "text", "text": "A"}, {"type": "text", "text": "B"}]}))
        provider = AnthropicLLMProvider(api_key="test-key", client=client)

        text = run(provider.generate(LLMGenerateRequest(provider="anthropic", model="claude-sonnet-4-6", inputText="Hello", maxTokens=200)))

        self.assertEqual(text, "AB")
        call = client.calls[0]
        self.assertEqual(call["url"], "https://api.anthropic.com/v1/messages")
        self.assertEqual(call["headers"]["x-api-key"], "test-key")
        self.assertIn("anthropic-version", call["headers"])
        self.assertEqual(call["json"]["messages"][0]["content"], [{"type": "text", "text": "Hello"}])
        self.assertEqual(call["json"]["max_tokens"], 200)
        self.assertNotIn("stream", call["json"])
        self.assertNotIn("tools", call["json"])

    def test_system_prompt_is_top_level(self):
        client = FakeClient(FakeResponse({"content": [{"type": "text", "text": "ok"}]}))
        provider = AnthropicLLMProvider(api_key="test-key", client=client)

        run(provider.generate(LLMGenerateRequest(provider="anthropic", model="claude-opus-4-8", inputText="Hi", systemPrompt="Be terse")))

        self.assertEqual(client.calls[0]["json"]["system"], "Be terse")
        self.assertEqual(client.calls[0]["json"]["messages"][0]["role"], "user")

    def test_image_data_url_source_block(self):
        client = FakeClient(FakeResponse({"content": [{"type": "text", "text": "vision"}]}))
        provider = AnthropicLLMProvider(api_key="test-key", client=client)
        with patch("llm.providers.anthropic_provider.prepare_llm_image_inputs", return_value=[FAKE_IMAGE]):
            run(provider.generate(LLMGenerateRequest(provider="anthropic", model="claude-haiku-4-5-20251001", inputText="Describe", imageInputs=[{"index": 0, "url": "input/ref.png"}])))

        image_block = client.calls[0]["json"]["messages"][0]["content"][1]
        self.assertEqual(image_block["type"], "image")
        self.assertEqual(image_block["source"], {"type": "base64", "media_type": "image/png", "data": "ZmFrZQ=="})

    def test_error_is_normalized_and_redacts_key(self):
        client = FakeClient(FakeResponse({}, status_code=429, text="bad test-key"))
        provider = AnthropicLLMProvider(api_key="test-key", client=client)

        with self.assertRaisesRegex(LLMProviderError, r"Claude: bad \[redacted\]"):
            run(provider.generate(LLMGenerateRequest(provider="anthropic", model="claude-sonnet-4-6", inputText="Hello")))

    def test_rejects_remote_image_urls_without_calling_client(self):
        client = FakeClient(FakeResponse({"content": []}))
        provider = AnthropicLLMProvider(api_key="test-key", client=client)

        with self.assertRaisesRegex(LLMProviderError, "remote image URLs"):
            run(provider.generate(LLMGenerateRequest(provider="anthropic", model="claude-sonnet-4-6", inputText="Describe", imageInputs=[{"index": 0, "url": "https://example.test/a.png"}])))
        self.assertEqual(client.calls, [])


if __name__ == "__main__":
    unittest.main()
