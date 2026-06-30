import os
import unittest
from pathlib import Path

from scripts import run_video_real_smoke as smoke


VALID_ARGS = [
    "--run-real-smoke",
    "--accept-billable-provider-calls",
    "--provider",
    "google",
    "--model",
    "veo-3.1-fast-generate-001",
]
VALID_ENV = {smoke.ENABLE_ENV: "1"}


class FakeRuntime:
    def __init__(self, *, fail=None):
        self.validate_calls = []
        self.run_calls = []
        self.project_path = None
        self.fail = fail

    def validate_plan(self, provider, model):
        self.validate_calls.append((provider, model))
        return smoke.SmokePlan(provider, model, "4s", 4, "720p", "16:9")

    def run(self, project_path, plan, *, poll_max, poll_interval_seconds):
        self.project_path = project_path
        self.run_calls.append((plan, poll_max, poll_interval_seconds))
        self.assert_isolated_project(project_path)
        print("fake runtime output must be discarded")
        if self.fail:
            raise self.fail
        artifact = Path(project_path, "generation", "videos", "smoke.mp4")
        artifact.parent.mkdir(parents=True)
        artifact.write_bytes(b"mock-only")
        return smoke.SmokeResult("success", True)

    @staticmethod
    def assert_isolated_project(project_path):
        path = Path(project_path)
        if not path.is_dir() or not path.name.startswith("node-canvas-video-smoke-"):
            raise AssertionError("expected an isolated temporary project")


class VideoRealSmokeHarnessTest(unittest.TestCase):
    def invoke(self, args, *, environ=VALID_ENV, runtime=None):
        output = []
        factory_calls = []
        selected_runtime = runtime or FakeRuntime()

        def factory():
            factory_calls.append(True)
            return selected_runtime

        code = smoke.main(args, environ=environ, runtime_factory=factory, output=output.append)
        return code, output, factory_calls, selected_runtime

    def assert_refused_before_runtime(self, args, *, environ=VALID_ENV):
        code, output, factory_calls, _ = self.invoke(args, environ=environ)
        self.assertNotEqual(code, 0)
        self.assertEqual(factory_calls, [])
        self.assertTrue(any("REFUSED" in line for line in output))

    def test_missing_cli_gate_refuses_before_runtime_import(self):
        args = [value for value in VALID_ARGS if value != "--run-real-smoke"]
        self.assert_refused_before_runtime(args)

    def test_missing_environment_gate_refuses_before_runtime_import(self):
        self.assert_refused_before_runtime(VALID_ARGS, environ={})

    def test_missing_charge_acceptance_refuses_before_runtime_import(self):
        args = [value for value in VALID_ARGS if value != "--accept-billable-provider-calls"]
        self.assert_refused_before_runtime(args)

    def test_provider_allowlist_refuses_seedance_before_runtime_import(self):
        args = VALID_ARGS.copy()
        args[args.index("google")] = "seedance_official"
        self.assert_refused_before_runtime(args)

    def test_kling_omni_refuses_before_runtime_import(self):
        args = VALID_ARGS.copy()
        args[args.index("veo-3.1-fast-generate-001")] = "kling-v3-omni"
        self.assert_refused_before_runtime(args)

    def test_asset_and_non_text_arguments_are_not_supported(self):
        for extra in (
            ["--image", "local.png"],
            ["--video-mode", "image-to-video"],
            ["--video-mode", "reference-video"],
            ["--public-asset-storage", "r2"],
            ["--custom-params", "{}"],
        ):
            with self.subTest(extra=extra):
                self.assert_refused_before_runtime(VALID_ARGS + extra)

    def test_all_multiple_providers_and_multiple_videos_are_rejected(self):
        invalid = (
            VALID_ARGS + ["--all"],
            VALID_ARGS + ["--provider", "kie"],
            VALID_ARGS + ["--number-of-videos", "2"],
        )
        for args in invalid:
            with self.subTest(args=args):
                self.assert_refused_before_runtime(args)

    def test_polling_cost_controls_are_hard_bounded(self):
        self.assertEqual(smoke.MAX_CREATE_ATTEMPTS, 1)
        self.assertLessEqual(smoke.DEFAULT_POLL_MAX, 30)
        self.assertGreaterEqual(smoke.DEFAULT_POLL_INTERVAL_SECONDS, 10)
        self.assert_refused_before_runtime(VALID_ARGS + ["--poll-max", "31"])
        self.assert_refused_before_runtime(VALID_ARGS + ["--poll-interval", "9.9"])

    def test_capability_contract_selects_minimum_cost_parameters(self):
        capability = {
            "provider": "google",
            "model": "model-a",
            "family": "veo",
            "taskTypes": ["text-to-video", "image-to-video"],
            "inputCapabilities": {"text:prompt": {"supported": True}},
            "parameters": {
                "duration": {"options": ["8s", "4s", "6s"]},
                "resolution": {"options": ["1080p", "720p"]},
                "aspectRatio": {"options": ["9:16", "16:9"], "default": "16:9"},
                "numberOfVideos": {"min": 1, "max": 4},
            },
        }
        plan = smoke._validate_capability("google", "model-a", capability)
        self.assertEqual(plan.duration, "4s")
        self.assertEqual(plan.duration_seconds, 4)
        self.assertEqual(plan.resolution, "720p")
        self.assertEqual(plan.aspect_ratio, "16:9")

    def test_capability_contract_rejects_seedance_non_text_and_unbounded_specs(self):
        base = {
            "provider": "kie",
            "model": "model-a",
            "family": "wan",
            "taskTypes": ["text-to-video"],
            "inputCapabilities": {"text:prompt": {"supported": True}},
            "parameters": {
                "duration": {"options": ["2s"]},
                "resolution": {"options": ["720p"]},
            },
        }
        cases = []
        seedance = {**base, "family": "seedance"}
        cases.append(seedance)
        non_text = {**base, "taskTypes": ["image-to-video"]}
        cases.append(non_text)
        no_duration = {**base, "parameters": {"resolution": {"options": ["720p"]}}}
        cases.append(no_duration)
        no_resolution = {**base, "parameters": {"duration": {"options": ["2s"]}}}
        cases.append(no_resolution)
        for capability in cases:
            with self.subTest(capability=capability):
                with self.assertRaises(smoke.GateError):
                    smoke._validate_capability("kie", "model-a", capability)

    def test_temp_project_exists_only_after_gates_and_is_cleaned(self):
        runtime = FakeRuntime()
        code, _, factory_calls, _ = self.invoke(VALID_ARGS, runtime=runtime)
        self.assertEqual(code, 0)
        self.assertEqual(factory_calls, [True])
        self.assertEqual(len(runtime.run_calls), 1)
        self.assertEqual(runtime.run_calls[0][1:], (30, 10.0))
        self.assertIsNotNone(runtime.project_path)
        self.assertFalse(Path(runtime.project_path).exists())

    def test_no_custom_project_output_or_artifact_retention_options(self):
        for extra in (
            ["--project-path", os.getcwd()],
            ["--output-directory", os.getcwd()],
            ["--keep-artifacts"],
        ):
            with self.subTest(extra=extra):
                self.assert_refused_before_runtime(VALID_ARGS + extra)

    def test_runtime_exception_does_not_print_secret_url_or_raw_response(self):
        secret = "top-secret-token"
        remote_url = "https://example.invalid/video.mp4?signature=abc"
        runtime = FakeRuntime(fail=RuntimeError(f"{secret} {remote_url} raw response"))
        code, output, _, _ = self.invoke(VALID_ARGS, runtime=runtime)
        self.assertNotEqual(code, 0)
        rendered = "\n".join(output)
        self.assertNotIn(secret, rendered)
        self.assertNotIn(remote_url, rendered)
        self.assertNotIn("raw response", rendered)
        self.assertIn("RuntimeError", rendered)

    def test_runtime_stdout_and_error_summary_are_not_forwarded(self):
        class UnsuccessfulRuntime(FakeRuntime):
            def run(self, project_path, plan, *, poll_max, poll_interval_seconds):
                self.project_path = project_path
                self.assert_isolated_project(project_path)
                print("https://secret.invalid/provider-task-id")
                return smoke.SmokeResult("error", False, "token=secret raw response")

        code, output, _, _ = self.invoke(VALID_ARGS, runtime=UnsuccessfulRuntime())
        self.assertNotEqual(code, 0)
        rendered = "\n".join(output)
        self.assertNotIn("secret.invalid", rendered)
        self.assertNotIn("provider-task-id", rendered)
        self.assertNotIn("token=secret", rendered)
        self.assertIn("video smoke did not complete successfully", rendered)


if __name__ == "__main__":
    unittest.main()
