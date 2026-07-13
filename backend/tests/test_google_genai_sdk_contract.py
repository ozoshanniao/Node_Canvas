import ast
import importlib.metadata
import inspect
import unittest
from pathlib import Path
from unittest.mock import patch

from google import genai
from google.auth.credentials import AnonymousCredentials
from google.genai import interactions, types
from google.genai._gaos.interactions import Interactions as GeneratedInteractions
from google.genai._gaos.models.createinteraction import CreateInteractionRequest
from pydantic import ValidationError

from video_generation.providers.google_omni_provider import run_blocked_transport_contract


class GoogleGenAISDKContractTest(unittest.TestCase):
    def test_sdk_version_is_exact(self):
        self.assertEqual(importlib.metadata.version("google-genai"), "2.10.0")

    def test_vertex_client_and_api_revision_header_contract(self):
        client = genai.Client(
            vertexai=True,
            project="contract-project",
            location="global",
            credentials=AnonymousCredentials(),
            http_options=types.HttpOptions(
                headers={"Api-Revision": "2026-05-20"},
            ),
        )
        try:
            self.assertTrue(client.vertexai)
            self.assertTrue(callable(client.interactions.create))
            self.assertEqual(
                client._api_client._http_options.headers["Api-Revision"],
                "2026-05-20",
            )
        finally:
            client.close()

    def test_typed_interaction_video_request_contract(self):
        generation_config = interactions.GenerationConfig(
            video_config=interactions.VideoConfig(task="text_to_video"),
        )
        response_format = interactions.VideoResponseFormat(
            type="video",
            aspect_ratio="16:9",
            delivery="inline",
        )
        request = interactions.CreateModelInteraction(
            model="gemini-omni-flash-preview",
            input="Create a short video.",
            generation_config=generation_config,
            response_format=response_format,
            background=False,
            store=False,
            stream=False,
        )

        data = request.model_dump(exclude_none=True)
        self.assertEqual(data["generation_config"]["video_config"]["task"], "text_to_video")
        self.assertEqual(data["response_format"]["type"], "video")
        self.assertEqual(data["response_format"]["aspect_ratio"], "16:9")
        self.assertEqual(data["response_format"]["delivery"], "inline")
        self.assertFalse(data["background"])
        self.assertFalse(data["store"])
        self.assertFalse(data["stream"])
        self.assertNotIn("previous_interaction_id", data)

    def test_create_request_envelope_requires_body_and_body_keywords_wrap_it(self):
        body = interactions.CreateModelInteraction(
            model="gemini-omni-flash-preview",
            input="prompt",
            response_format=interactions.VideoResponseFormat(type="video"),
        )
        with self.assertRaises(ValidationError):
            CreateInteractionRequest()
        self.assertNotIsInstance(body, CreateInteractionRequest)
        envelope = CreateInteractionRequest(body=body)
        self.assertEqual(envelope.body.model, body.model)
        self.assertEqual(envelope.body.input, body.input)

        source = inspect.getsource(GeneratedInteractions.create)
        self.assertIn('_request_kwargs["body"] = _body_kwargs', source)
        self.assertIn('models.CreateInteractionRequest', source)

    def test_canonical_video_body_serializes_to_blocked_transport(self):
        request = interactions.CreateModelInteraction(
            model="gemini-omni-flash-preview",
            input="prompt",
            response_format=interactions.VideoResponseFormat(
                type="video", aspect_ratio="16:9", delivery="inline"
            ),
            generation_config=interactions.GenerationConfig(
                video_config=interactions.VideoConfig(task="text_to_video")
            ),
            background=False, store=False, stream=False,
        )
        with patch("google.auth.default") as adc:
            state = run_blocked_transport_contract(request)
        adc.assert_not_called()
        self.assertTrue(state["request_validation"])
        self.assertTrue(state["request_serialization"])
        self.assertTrue(state["mock_transport_reached"])

    def test_video_response_format_variants_are_typed(self):
        for aspect_ratio in ("16:9", "9:16"):
            for delivery in ("inline", "uri"):
                with self.subTest(aspect_ratio=aspect_ratio, delivery=delivery):
                    value = interactions.VideoResponseFormat(
                        type="video",
                        aspect_ratio=aspect_ratio,
                        delivery=delivery,
                    )
                    self.assertEqual(value.type, "video")
                    self.assertEqual(value.aspect_ratio, aspect_ratio)
                    self.assertEqual(value.delivery, delivery)

    def test_interaction_exposes_video_data_uri_and_steps(self):
        inline_video = interactions.VideoContent(
            data="AAAAHGZ0eXBtcDQy",
            mime_type="video/mp4",
        )
        interaction = interactions.Interaction(
            status="completed",
            output_video=inline_video,
            steps=[],
        )
        self.assertEqual(interaction.output_video.data, "AAAAHGZ0eXBtcDQy")
        self.assertEqual(interaction.steps, [])

        uri_video = interactions.VideoContent(
            uri="https://media.example.test/video.mp4",
            mime_type="video/mp4",
        )
        self.assertEqual(uri_video.uri, "https://media.example.test/video.mp4")

    def test_create_public_contract_accepts_request_body(self):
        signature = inspect.signature(genai.Client.interactions.fget)
        self.assertIn("self", signature.parameters)
        annotations = interactions.CreateModelInteraction.__annotations__
        for name in (
            "model",
            "input",
            "generation_config",
            "response_format",
            "background",
            "store",
            "stream",
        ):
            self.assertIn(name, annotations)

    def test_interactions_create_and_multimodal_video_contract(self):
        client = genai.Client(
            vertexai=True,
            project="contract-project",
            location="global",
            credentials=AnonymousCredentials(),
        )
        try:
            signature = inspect.signature(client.interactions.create)
            self.assertIn("request", signature.parameters)
            self.assertIn("timeout", signature.parameters)
        finally:
            client.close()

        request = interactions.CreateModelInteraction(
            model="gemini-omni-flash-preview",
            input=[
                interactions.TextContent(text="<FIRST_FRAME> Animate"),
                interactions.ImageContent(data="iVBORw0KGgo=", mime_type="image/png"),
            ],
            generation_config=interactions.GenerationConfig(
                video_config=interactions.VideoConfig(task="image_to_video"),
            ),
            response_format=interactions.VideoResponseFormat(
                type="video", aspect_ratio="9:16", delivery="inline"
            ),
            background=False,
            store=False,
            stream=False,
        )
        dumped = request.model_dump(exclude_none=True)
        self.assertEqual(dumped["input"][1]["data"], "iVBORw0KGgo=")
        self.assertEqual(dumped["generation_config"]["video_config"]["task"], "image_to_video")
        self.assertNotIn("previous_interaction_id", dumped)
        self.assertNotIn("duration", dumped["response_format"])
        self.assertNotIn("gcs_uri", dumped["response_format"])

        step = interactions.ModelOutputStep(content=[
            interactions.VideoContent(data="AAAAHGZ0eXBtcDQy", mime_type="video/mp4")
        ])
        response = interactions.Interaction(status="completed", steps=[step])
        self.assertEqual(response.steps[0].type, "model_output")
        self.assertEqual(response.steps[0].content[0].type, "video")
        self.assertIsInstance(response.steps[0].content[0].data, str)

    def test_production_google_integrations_do_not_use_files_api(self):
        backend = Path(__file__).resolve().parents[1]
        roots = [
            backend / "image_generation",
            backend / "video_generation",
            backend / "llm",
            backend / "engines",
        ]
        files = [backend / "main.py"]
        for root in roots:
            files.extend(root.rglob("*.py"))

        forbidden = (".files.upload", ".files.get", ".files.delete")
        for path in files:
            source = path.read_text(encoding="utf-8-sig")
            ast.parse(source, filename=str(path))
            for marker in forbidden:
                self.assertNotIn(marker, source, f"{path} must not depend on Vertex Files API")


if __name__ == "__main__":
    unittest.main()
