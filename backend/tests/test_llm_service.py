import asyncio
import unittest
from pydantic import ValidationError

from llm.providers.base import LLMProviderError
from llm.schemas import LLMGenerateRequest
from llm.service import LLMService
from llm.specs import get_llm_specs


def run(coro):
    return asyncio.run(coro)


class FakeProvider:
    def __init__(self, text):
        self.text = text
        self.requests = []

    async def generate(self, request):
        self.requests.append(request)
        return self.text


class LLMServiceTest(unittest.TestCase):
    def test_registers_openai_and_anthropic(self):
        service = LLMService()
        self.assertIn("google", service.providers)
        self.assertIn("openai", service.providers)
        self.assertIn("anthropic", service.providers)

    def test_routes_openai_and_anthropic(self):
        service = LLMService()
        service.providers["openai"] = FakeProvider("openai text")
        service.providers["anthropic"] = FakeProvider("claude text")

        openai_text = run(service.generate(LLMGenerateRequest(provider="openai", model="gpt-5.5", inputText="Hi")))
        claude_text = run(service.generate(LLMGenerateRequest(provider="anthropic", model="claude-sonnet-4-6", inputText="Hi")))

        self.assertEqual(openai_text, "openai text")
        self.assertEqual(claude_text, "claude text")

    def test_unknown_provider_safely_errors(self):
        with self.assertRaisesRegex(LLMProviderError, "not supported"):
            run(LLMService().generate(LLMGenerateRequest(provider="unknown", model="legacy", inputText="Hi")))

    def test_request_schema_rejects_api_key_and_base_url(self):
        with self.assertRaises(ValidationError):
            LLMGenerateRequest(provider="openai", model="gpt-5.5", inputText="Hi", apiKey="secret")
        with self.assertRaises(ValidationError):
            LLMGenerateRequest(provider="openai", model="gpt-5.5", inputText="Hi", baseUrl="https://example.test/v1")


class LLMSpecsTest(unittest.TestCase):
    def test_specs_include_existing_and_new_models(self):
        specs = get_llm_specs()
        providers = {provider["id"]: provider for provider in specs["providers"]}

        self.assertIn("Google", providers)
        self.assertIn("gemini-3.1-flash-lite", [model["id"] for model in providers["Google"]["models"]])
        self.assertEqual([model["id"] for model in providers["openai"]["models"]], ["gpt-5.5", "gpt-5.4-mini", "gpt-5.4-nano"])
        self.assertEqual([model["id"] for model in providers["anthropic"]["models"]], ["claude-opus-4-8", "claude-sonnet-4-6", "claude-haiku-4-5-20251001"])

    def test_specs_are_non_streaming_and_limited_to_phase_1a_capabilities(self):
        specs = get_llm_specs()
        for provider in specs["providers"]:
            for model in provider["models"]:
                self.assertFalse(model["streaming"])
                self.assertTrue(model["supportsText"])
                self.assertTrue(model["supportsSystemPrompt"])
                self.assertTrue(model["supportsTemperature"])
                self.assertTrue(model["supportsMaxTokens"])
                self.assertNotIn("toolCalling", model)
                self.assertNotIn("fileInput", model)
                self.assertNotIn("videoInput", model)


if __name__ == "__main__":
    unittest.main()
