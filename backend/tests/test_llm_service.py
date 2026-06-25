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
    def test_registers_openai_anthropic_and_google_studio(self):
        service = LLMService()
        self.assertIn("google", service.providers)
        self.assertIn("google_studio", service.providers)
        self.assertIn("openai", service.providers)
        self.assertIn("anthropic", service.providers)

    def test_routes_google_cloud_legacy_and_google_studio_separately(self):
        service = LLMService()
        service.providers["google"] = FakeProvider("google cloud text")
        service.providers["google_studio"] = FakeProvider("studio text")

        legacy_text = run(service.generate(LLMGenerateRequest(provider="Google", model="gemini-3.1-flash-lite", inputText="Hi")))
        cloud_text = run(service.generate(LLMGenerateRequest(provider="google", model="gemini-3.1-flash-lite", inputText="Hi")))
        studio_text = run(service.generate(LLMGenerateRequest(provider="google_studio", model="gemini-3.5-flash", inputText="Hi")))

        self.assertEqual(legacy_text, "google cloud text")
        self.assertEqual(cloud_text, "google cloud text")
        self.assertEqual(studio_text, "studio text")
        self.assertEqual(service.providers["google"].requests[0].provider, "Google")
        self.assertEqual(service.providers["google_studio"].requests[0].provider, "google_studio")

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
        for field, value in {"endpoint": "https://example.test", "project": "p", "location": "us", "vertexai": True}.items():
            with self.assertRaises(ValidationError):
                LLMGenerateRequest(provider="google_studio", model="gemini-3.5-flash", inputText="Hi", **{field: value})


class LLMSpecsTest(unittest.TestCase):
    def test_specs_include_existing_and_new_models(self):
        specs = get_llm_specs()
        providers = {provider["id"]: provider for provider in specs["providers"]}

        self.assertIn("Google", providers)
        self.assertIn("google_studio", providers)
        self.assertEqual(providers["Google"]["label"], "Google Cloud")
        self.assertEqual(providers["google_studio"]["label"], "Google Studio")
        self.assertIn("gemini-3.1-flash-lite", [model["id"] for model in providers["Google"]["models"]])
        self.assertEqual([model["id"] for model in providers["google_studio"]["models"]], ["gemini-3.5-flash", "gemini-3.1-pro-preview", "gemini-3.1-flash-lite"])
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
                self.assertNotIn("audioInput", model)
                self.assertNotIn("agent", model)
                self.assertNotIn("imageGeneration", model)
                self.assertNotIn("videoGeneration", model)


if __name__ == "__main__":
    unittest.main()
