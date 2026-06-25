import unittest
from unittest.mock import patch

from llm.providers.google_provider import GoogleLLMProvider
from llm.providers.base import LLMProviderError
from llm.schemas import LLMGenerateRequest


class GoogleCloudLLMProviderTest(unittest.TestCase):
    def test_client_initialization_remains_vertex_google_cloud(self):
        calls = []

        def fake_client(**kwargs):
            calls.append(kwargs)
            return object()

        with patch("llm.providers.google_provider.genai.Client", side_effect=fake_client):
            provider = GoogleLLMProvider(api_key="cloud-key")

        self.assertIsNotNone(provider.client)
        self.assertEqual(calls, [{"vertexai": True, "api_key": "cloud-key"}])

    def test_missing_google_cloud_key_uses_google_cloud_error(self):
        provider = GoogleLLMProvider(api_key=None)
        provider.api_key = None
        provider.client = None

        with self.assertRaisesRegex(LLMProviderError, "GOOGLE_CLOUD_API_KEY is missing"):
            import asyncio
            asyncio.run(provider.generate(LLMGenerateRequest(provider="google", model="gemini-3.1-flash-lite", inputText="Hi")))


if __name__ == "__main__":
    unittest.main()
