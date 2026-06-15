import asyncio
import unittest
from unittest.mock import patch

from llm.providers.base import LLMProviderError
from llm.providers.deepseek_provider import DeepSeekLLMProvider
from llm.schemas import LLMGenerateRequest
from llm.service import LLMService


def run(coro):
    return asyncio.run(coro)


class FakeResponse:
    def __init__(self, payload, status_code=200):
        self._payload = payload
        self.status_code = status_code
        self.text = str(payload)

    def json(self):
        return self._payload


class FakeDeepSeekClient:
    def __init__(self, response=None):
        self.calls = []
        self.response = response or FakeResponse({
            "choices": [
                {
                    "message": {
                        "content": "Final answer",
                        "reasoning_content": "Hidden reasoning",
                    }
                }
            ],
            "usage": {
                "prompt_tokens": 3,
                "completion_tokens": 4,
                "total_tokens": 7,
                "prompt_cache_hit_tokens": 1,
                "prompt_cache_miss_tokens": 2,
                "completion_tokens_details": {"reasoning_tokens": 5},
            },
        })

    async def post(self, url, headers=None, json=None):
        self.calls.append({"url": url, "headers": headers, "json": json})
        return self.response


class FakeProvider:
    def __init__(self, text):
        self.text = text
        self.requests = []

    async def generate(self, request):
        self.requests.append(request)
        return self.text


class DeepSeekLLMProviderTest(unittest.TestCase):
    def setUp(self):
        self.resolver_patch = patch(
            "llm.providers.deepseek_provider.resolve_provider_secret",
            return_value=None,
        )
        self.resolver_patch.start()

    def tearDown(self):
        self.resolver_patch.stop()

    def test_request_body_flash_defaults(self):
        client = FakeDeepSeekClient()
        provider = DeepSeekLLMProvider(api_key="test-key", client=client)
        request = LLMGenerateRequest(
            provider="deepseek",
            model="deepseek-v4-flash",
            inputText="Hello",
            maxTokens=4096,
            thinking="enabled",
            reasoningEffort="high",
        )

        text = run(provider.generate(request))

        self.assertEqual(text, "Final answer")
        call = client.calls[0]
        self.assertEqual(call["url"], "https://api.deepseek.com/chat/completions")
        self.assertEqual(call["headers"]["Authorization"], "Bearer test-key")
        self.assertEqual(call["json"]["model"], "deepseek-v4-flash")
        self.assertEqual(call["json"]["messages"], [{"role": "user", "content": "Hello"}])
        self.assertEqual(call["json"]["thinking"], {"type": "enabled"})
        self.assertEqual(call["json"]["reasoning_effort"], "high")
        self.assertEqual(call["json"]["stream"], False)
        self.assertEqual(call["json"]["max_tokens"], 4096)

    def test_request_body_pro_max_reasoning(self):
        client = FakeDeepSeekClient()
        provider = DeepSeekLLMProvider(api_key="test-key", base_url="https://mock.deepseek.test", client=client)
        request = LLMGenerateRequest(
            provider="deepseek",
            model="deepseek-v4-pro",
            inputText="Use max reasoning",
            thinking="enabled",
            reasoningEffort="max",
        )

        run(provider.generate(request))

        call = client.calls[0]
        self.assertEqual(call["url"], "https://mock.deepseek.test/chat/completions")
        self.assertEqual(call["json"]["model"], "deepseek-v4-pro")
        self.assertEqual(call["json"]["reasoning_effort"], "max")

    def test_thinking_disabled_omits_reasoning_effort(self):
        client = FakeDeepSeekClient()
        provider = DeepSeekLLMProvider(api_key="test-key", client=client)
        request = LLMGenerateRequest(
            provider="deepseek",
            model="deepseek-v4-flash",
            inputText="No thinking",
            thinking="disabled",
            reasoningEffort="max",
        )

        run(provider.generate(request))

        self.assertEqual(client.calls[0]["json"]["thinking"], {"type": "disabled"})
        self.assertNotIn("reasoning_effort", client.calls[0]["json"])

    def test_response_uses_content_only(self):
        client = FakeDeepSeekClient()
        provider = DeepSeekLLMProvider(api_key="test-key", client=client)

        text = run(provider.generate(LLMGenerateRequest(
            provider="deepseek",
            model="deepseek-v4-flash",
            inputText="Return content",
        )))

        self.assertEqual(text, "Final answer")
        self.assertNotIn("Hidden reasoning", text)

    def test_image_input_returns_error_without_calling_client(self):
        client = FakeDeepSeekClient()
        provider = DeepSeekLLMProvider(api_key="test-key", client=client)

        with self.assertRaisesRegex(LLMProviderError, "does not support image input"):
            run(provider.generate(LLMGenerateRequest(
                provider="deepseek",
                model="deepseek-v4-flash",
                inputText="Describe image",
                imageInputs=[{"index": 0, "url": "input/ref.png"}],
            )))

        self.assertEqual(client.calls, [])

    def test_missing_api_key_returns_clear_error_without_calling_client(self):
        client = FakeDeepSeekClient()
        provider = DeepSeekLLMProvider(api_key="", client=client)

        with self.assertRaisesRegex(LLMProviderError, "DeepSeek credentials are not configured"):
            run(provider.generate(LLMGenerateRequest(
                provider="deepseek",
                model="deepseek-v4-flash",
                inputText="Hello",
            )))

        self.assertEqual(client.calls, [])


class DeepSeekLLMServiceRoutingTest(unittest.TestCase):
    def test_provider_routing_uses_deepseek_provider(self):
        service = LLMService(yunwu_api_key="yunwu", google_api_key="google", deepseek_api_key="deepseek")
        deepseek = FakeProvider("deepseek text")
        google = FakeProvider("google text")
        service.providers["deepseek"] = deepseek
        service.providers["google"] = google

        text = run(service.generate(LLMGenerateRequest(
            provider="deepseek",
            model="deepseek-v4-flash",
            inputText="Route me",
        )))

        self.assertEqual(text, "deepseek text")
        self.assertEqual(len(deepseek.requests), 1)
        self.assertEqual(len(google.requests), 0)

    def test_existing_provider_routing_is_unchanged(self):
        service = LLMService(yunwu_api_key="yunwu", google_api_key="google", deepseek_api_key="deepseek")
        deepseek = FakeProvider("deepseek text")
        google = FakeProvider("google text")
        service.providers["deepseek"] = deepseek
        service.providers["google"] = google

        text = run(service.generate(LLMGenerateRequest(
            provider="Google",
            model="gemini-3.1-flash-lite",
            inputText="Route me",
        )))

        self.assertEqual(text, "google text")
        self.assertEqual(len(google.requests), 1)
        self.assertEqual(len(deepseek.requests), 0)


if __name__ == "__main__":
    unittest.main()
