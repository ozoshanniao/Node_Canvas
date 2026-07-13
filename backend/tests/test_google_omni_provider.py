import os
import unittest
from unittest.mock import MagicMock, patch

from google.genai import interactions

from video_generation.providers.google_omni_provider import (
    GoogleOmniCreateError,
    GoogleOmniProvider,
    ProjectConfigurationError,
    classify_google_omni_exception,
    run_blocked_transport_contract,
)


class UnsafeSdkError(Exception):
    def __init__(self, status_code=None, response=None):
        super().__init__("secret body https://secret.invalid token=private")
        self.status_code = status_code
        self.response = response


class GoogleOmniProviderTest(unittest.TestCase):
    def test_client_is_lazy_and_uses_isolated_vertex_configuration(self):
        provider = GoogleOmniProvider(project="mock-project")
        with patch("video_generation.providers.google_omni_provider.genai.Client") as client_type:
            self.assertIsNone(provider.client)
            client_type.assert_not_called()
            client = provider._client()

        self.assertIs(client, client_type.return_value)
        kwargs = client_type.call_args.kwargs
        self.assertTrue(kwargs["vertexai"])
        self.assertEqual(kwargs["project"], "mock-project")
        self.assertEqual(kwargs["location"], "global")
        self.assertEqual(kwargs["http_options"].headers["Api-Revision"], "2026-05-20")
        self.assertNotIn("api_key", kwargs)

    def test_uri_delivery_is_rejected_before_project_client_or_sdk(self):
        provider = GoogleOmniProvider()
        request = interactions.CreateModelInteraction(
            model="gemini-omni-flash-preview",
            input="prompt",
            response_format=interactions.VideoResponseFormat(
                type="video", aspect_ratio="16:9", delivery="uri"
            ),
        )
        with (
            patch.object(provider, "_project") as project,
            patch.object(provider, "_build_client") as build_client,
            self.assertRaises(GoogleOmniCreateError) as raised,
        ):
            provider.create_interaction(request)
        project.assert_not_called()
        build_client.assert_not_called()
        diagnostics = raised.exception.diagnostics
        self.assertEqual(str(raised.exception), "Gemini Omni URI delivery is not supported.")
        self.assertEqual(diagnostics.error_category, "unsupported_delivery")
        self.assertEqual(diagnostics.failure_stage, "request_validation")
        self.assertFalse(diagnostics.project_resolution_completed)
        self.assertFalse(diagnostics.client_initialization_completed)
        self.assertFalse(diagnostics.sdk_create_entered)
        self.assertFalse(diagnostics.transport_invocation_started)
        self.assertFalse(diagnostics.http_response_received)
        self.assertFalse(diagnostics.provider_response_received)

    def test_create_uses_canonical_body_keywords_without_files_or_get(self):
        client = MagicMock()
        response = interactions.Interaction(status="completed", steps=[])
        client.interactions.create.return_value = response
        provider = GoogleOmniProvider(client=client)
        request = interactions.CreateModelInteraction(
            model="gemini-omni-flash-preview",
            input="prompt",
            response_format=interactions.VideoResponseFormat(
                type="video", aspect_ratio="16:9", delivery="inline"
            ),
            generation_config=interactions.GenerationConfig(
                video_config=interactions.VideoConfig(task="text_to_video")
            ),
            background=False,
            store=False,
            stream=False,
        )

        self.assertIs(provider.create_interaction(request), response)
        client.interactions.create.assert_called_once()
        kwargs = client.interactions.create.call_args.kwargs
        self.assertNotIn("request", kwargs)
        self.assertEqual(set(kwargs), {
            "model", "input", "response_format", "generation_config",
            "background", "store", "stream",
        })
        self.assertEqual(kwargs["model"], "gemini-omni-flash-preview")
        self.assertEqual(kwargs["input"], "prompt")
        self.assertEqual(kwargs["response_format"].type, "video")
        self.assertEqual(kwargs["response_format"].aspect_ratio, "16:9")
        self.assertEqual(kwargs["response_format"].delivery, "inline")
        self.assertIsNone(kwargs["response_format"].duration)
        self.assertIsNone(kwargs["response_format"].gcs_uri)
        self.assertEqual(kwargs["generation_config"].video_config.task, "text_to_video")
        self.assertFalse(kwargs["background"])
        self.assertFalse(kwargs["store"])
        self.assertFalse(kwargs["stream"])
        for forbidden in (
            "duration", "resolution", "seed", "negativePrompt", "temperature",
            "top_p", "customParams", "previous_interaction_id", "gcs_uri",
        ):
            self.assertNotIn(forbidden, kwargs)
        client.interactions.get.assert_not_called()
        client.files.upload.assert_not_called()
        client.files.get.assert_not_called()
        client.files.delete.assert_not_called()

    def test_success_path_diagnostics_are_set_only_after_real_boundaries(self):
        client = MagicMock()
        client.interactions.create.return_value = interactions.Interaction(status="completed", steps=[])
        provider = GoogleOmniProvider(project="mock-project")
        with patch.object(provider, "_build_client", return_value=client) as build_client:
            response = provider.create_interaction(interactions.CreateModelInteraction(
                model="gemini-omni-flash-preview", input="prompt"
            ))
        self.assertIs(response, client.interactions.create.return_value)
        build_client.assert_called_once_with("mock-project")
        diagnostics = provider.last_diagnostics
        self.assertTrue(diagnostics.project_resolution_completed)
        self.assertEqual(diagnostics.project_configuration_state, "configured")
        self.assertEqual(diagnostics.project_configuration_source, "configured")
        self.assertTrue(diagnostics.client_initialization_completed)
        self.assertTrue(diagnostics.sdk_create_entered)
        self.assertTrue(diagnostics.sdk_request_serialized)
        self.assertTrue(diagnostics.transport_invocation_started)
        self.assertTrue(diagnostics.provider_response_received)
        self.assertTrue(diagnostics.response_received)
        self.assertEqual(diagnostics.failure_stage, "none")
        self.assertIsNone(diagnostics.error_category)
        self.assertNotIn("mock-project", repr(diagnostics))

    def test_create_omits_unset_optional_body_keywords(self):
        client = MagicMock()
        client.interactions.create.return_value = interactions.Interaction(status="completed", steps=[])
        provider = GoogleOmniProvider(client=client)
        provider.create_interaction(interactions.CreateModelInteraction(
            model="gemini-omni-flash-preview", input="prompt"
        ))
        self.assertEqual(
            client.interactions.create.call_args.kwargs,
            {"model": "gemini-omni-flash-preview", "input": "prompt"},
        )

    def test_failure_stages_are_bounded_before_transport(self):
        request = interactions.CreateModelInteraction(
            model="gemini-omni-flash-preview", input="prompt"
        )
        provider = GoogleOmniProvider()
        with (
            patch.object(provider, "_project", side_effect=ValueError("unsafe")),
            patch("video_generation.providers.google_omni_provider.genai.Client") as client_type,
            self.assertRaises(GoogleOmniCreateError) as raised,
        ):
            provider.create_interaction(request)
        client_type.assert_not_called()
        self.assertEqual(raised.exception.diagnostics.failure_stage, "project_resolution")
        self.assertEqual(raised.exception.diagnostics.error_category, "project_configuration")
        self.assertEqual(raised.exception.diagnostics.project_configuration_state, "unresolved")
        self.assertEqual(raised.exception.diagnostics.project_configuration_source, "unknown")
        self.assertFalse(raised.exception.diagnostics.client_initialization_completed)
        self.assertFalse(raised.exception.diagnostics.sdk_create_entered)

        provider = GoogleOmniProvider()
        with (
            patch.object(provider, "_project", return_value="contract-project"),
            patch.object(provider, "_build_client", side_effect=ValueError("unsafe")),
            self.assertRaises(GoogleOmniCreateError) as raised,
        ):
            provider.create_interaction(request)
        self.assertEqual(raised.exception.diagnostics.failure_stage, "client_initialization")
        self.assertTrue(raised.exception.diagnostics.project_resolution_completed)
        self.assertFalse(raised.exception.diagnostics.sdk_create_entered)

        provider = GoogleOmniProvider(client=MagicMock())
        invalid = MagicMock(model=None, input=None)
        with self.assertRaises(GoogleOmniCreateError) as raised:
            provider.create_interaction(invalid)
        self.assertEqual(raised.exception.diagnostics.failure_stage, "sdk_request_validation")
        self.assertFalse(raised.exception.diagnostics.sdk_create_entered)

        client = MagicMock()
        client.interactions.create.side_effect = ValueError("unsafe")
        provider = GoogleOmniProvider(client=client)
        with self.assertRaises(GoogleOmniCreateError) as raised:
            provider.create_interaction(request)
        diagnostics = raised.exception.diagnostics
        self.assertEqual(diagnostics.failure_stage, "sdk_request_serialization")
        self.assertTrue(diagnostics.sdk_create_entered)
        self.assertTrue(diagnostics.transport_invocation_started)
        self.assertFalse(diagnostics.http_response_received)

    def test_real_sdk_reaches_blocked_transport_without_adc_or_network(self):
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
        self.assertTrue(all(state.values()))

    def test_safe_exception_categories_do_not_copy_exception_text(self):
        cases = {
            400: ("request_validation", "4xx"),
            401: ("auth", "4xx"),
            403: ("permission", "4xx"),
            404: ("model_or_location", "4xx"),
            429: ("rate_limit", "4xx"),
            503: ("provider_unavailable", "5xx"),
            None: ("sdk_error", "none"),
        }
        for status_code, expected in cases.items():
            with self.subTest(status_code=status_code):
                diagnostics = classify_google_omni_exception(UnsafeSdkError(status_code))
                self.assertEqual((diagnostics.error_category, diagnostics.http_status_class), expected)
                self.assertEqual(diagnostics.exception_type, "UnsafeSdkError")
                self.assertEqual(diagnostics.response_received, status_code is not None)
                self.assertEqual(diagnostics.http_response_received, status_code is not None)
                serialized = repr(diagnostics)
                self.assertNotIn("secret.invalid", serialized)
                self.assertNotIn("private", serialized)

    def test_provider_wraps_sdk_error_with_safe_metadata_only(self):
        client = MagicMock()
        client.interactions.create.side_effect = UnsafeSdkError(403, response=object())
        provider = GoogleOmniProvider(client=client)
        request = interactions.CreateModelInteraction(model="gemini-omni-flash-preview", input="prompt")
        with self.assertRaises(GoogleOmniCreateError) as raised:
            provider.create_interaction(request)
        diagnostics = raised.exception.diagnostics
        self.assertEqual(diagnostics.error_category, "permission")
        self.assertEqual(diagnostics.http_status_class, "4xx")
        self.assertEqual(diagnostics.exception_type, "UnsafeSdkError")
        self.assertTrue(diagnostics.response_received)
        self.assertTrue(diagnostics.http_response_received)
        self.assertFalse(diagnostics.provider_response_received)
        self.assertTrue(diagnostics.sdk_request_serialized)
        self.assertTrue(diagnostics.transport_invocation_started)
        self.assertEqual(diagnostics.failure_stage, "provider_response")
        self.assertNotIn("secret.invalid", repr(diagnostics))

    def test_project_resolution_uses_only_explicit_and_declared_environment_sources(self):
        with patch.dict(
            os.environ,
            {
                "GOOGLE_CLOUD_PROJECT": "primary-project",
                "GOOGLE_PROJECT_ID": "secondary-project",
                "GOOGLE_PROJECT": "tertiary-project",
            },
            clear=True,
        ):
            self.assertEqual(GoogleOmniProvider(project="explicit-project")._project(), "explicit-project")
            self.assertEqual(GoogleOmniProvider()._project(), "primary-project")

    def test_project_resolution_accepts_sdk_project_identifier_shapes(self):
        cases = (
            "123456789012",
            "Domain.Example:Project-01",
            "Project_01",
        )
        for project in cases:
            with self.subTest(project_shape=len(project)):
                provider = GoogleOmniProvider(project=project)
                state = provider.runtime_project_configuration()
                self.assertTrue(state.passed)
                self.assertEqual((state.state, state.source), ("configured", "configured"))

    def test_missing_blank_and_invalid_projects_have_safe_stable_states(self):
        cases = (
            ({}, "missing", "absent"),
            ({"GOOGLE_CLOUD_PROJECT": "   "}, "blank", "configured"),
            ({"GOOGLE_CLOUD_PROJECT": "unsafe value"}, "invalid", "configured"),
        )
        for environment, state, source in cases:
            with self.subTest(state=state), patch.dict(os.environ, environment, clear=True):
                provider = GoogleOmniProvider()
                with self.assertRaises(ProjectConfigurationError) as raised:
                    provider._project()
                self.assertEqual((raised.exception.state, raised.exception.source), (state, source))
                self.assertNotIn("unsafe value", str(raised.exception))

                status = provider.runtime_project_configuration()
                self.assertFalse(status.passed)
                self.assertEqual((status.state, status.source), (state, source))

    def test_runtime_project_preflight_does_not_create_client_or_read_adc(self):
        with (
            patch.dict(os.environ, {"GOOGLE_CLOUD_PROJECT": "mock-project"}, clear=True),
            patch("video_generation.providers.google_omni_provider.genai.Client") as client_type,
            patch("google.auth.default") as adc,
        ):
            status = GoogleOmniProvider().runtime_project_configuration()
        self.assertTrue(status.passed)
        self.assertEqual((status.state, status.source), ("configured", "configured"))
        client_type.assert_not_called()
        adc.assert_not_called()

    def test_project_configuration_failure_never_enters_client_or_sdk(self):
        request = interactions.CreateModelInteraction(
            model="gemini-omni-flash-preview", input="prompt"
        )
        with (
            patch.dict(os.environ, {}, clear=True),
            patch("video_generation.providers.google_omni_provider.genai.Client") as client_type,
        ):
            provider = GoogleOmniProvider()
            with self.assertRaises(GoogleOmniCreateError) as raised:
                provider.create_interaction(request)
        diagnostics = raised.exception.diagnostics
        self.assertEqual(diagnostics.error_category, "project_configuration")
        self.assertEqual(diagnostics.failure_stage, "project_resolution")
        self.assertEqual(diagnostics.project_configuration_state, "missing")
        self.assertEqual(diagnostics.project_configuration_source, "absent")
        self.assertFalse(diagnostics.client_initialization_completed)
        self.assertFalse(diagnostics.sdk_create_entered)
        self.assertFalse(diagnostics.transport_invocation_started)
        client_type.assert_not_called()


if __name__ == "__main__":
    unittest.main()
