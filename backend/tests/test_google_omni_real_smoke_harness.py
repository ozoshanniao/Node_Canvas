import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from google.genai import interactions

from scripts import run_google_omni_real_smoke as smoke


VALID_ENV = {smoke.ENABLE_ENV: "1"}
VALID_ARGS = [
    "--run-real-smoke",
    "--accept-billable-provider-calls",
    "--case",
    "t2v",
]


class FakeRuntime:
    def __init__(self, result=None, fail=None, runtime_configuration=(True, "configured", "configured")):
        self.result = result or smoke.SmokeResult(
            case="t2v",
            status="success",
            artifact_ready=True,
            artifact_bytes=24,
            ftyp_valid=True,
            create_calls=1,
            query_calls=0,
        )
        self.fail = fail
        self.runtime_configuration = runtime_configuration
        self.validate_calls = []
        self.preflight_calls = []
        self.runtime_configuration_calls = 0
        self.sdk_contract_calls = 0
        self.run_calls = []
        self.project_path = None

    def validate_plan(self, case):
        self.validate_calls.append(case)
        return smoke.SmokePlan(
            case=case,
            mode=smoke.MODE_BY_CASE[case],
            task=smoke.TASK_BY_CASE[case],
            delivery="uri" if case == "uri" else "inline",
            duration=smoke.DURATION,
        )

    def preflight(self, plan):
        self.preflight_calls.append(plan)
        if plan.duration != smoke.DURATION:
            raise AssertionError("expected canonical duration")
        return True, True, True

    def runtime_configuration_preflight(self):
        self.runtime_configuration_calls += 1
        return self.runtime_configuration

    def sdk_contract_preflight(self):
        self.sdk_contract_calls += 1
        return {
            "project_resolution_contract": True,
            "client_construction_contract": True,
            "request_validation": True,
            "request_serialization": True,
            "mock_transport_reached": True,
        }

    def run(self, project_path, plan):
        self.project_path = project_path
        self.run_calls.append(plan)
        path = Path(project_path)
        if not path.is_dir() or not path.name.startswith("node-canvas-google-omni-smoke-"):
            raise AssertionError("expected isolated Omni smoke project")
        repository = Path(__file__).resolve().parents[2]
        self.assert_outside(path, repository)
        print("https://secret.invalid/provider/interaction-id?token=secret")
        if self.fail:
            raise self.fail
        return self.result

    @staticmethod
    def assert_outside(path, repository):
        resolved = path.resolve()
        root = repository.resolve()
        if resolved == root or root in resolved.parents:
            raise AssertionError("smoke project must be outside repository")


class GoogleOmniRealSmokeHarnessTest(unittest.TestCase):
    def invoke(self, args, *, environ=VALID_ENV, runtime=None):
        output = []
        factory_calls = []
        selected = runtime or FakeRuntime()

        def factory():
            factory_calls.append(True)
            return selected

        code = smoke.main(args, environ=environ, runtime_factory=factory, output=output.append)
        return code, output, factory_calls, selected

    def assert_refused_before_runtime(self, args, *, environ=VALID_ENV):
        code, output, factory_calls, _ = self.invoke(args, environ=environ)
        self.assertEqual(code, 2)
        self.assertEqual(factory_calls, [])
        self.assertTrue(any("REFUSED" in line for line in output))

    def test_missing_each_coarse_gate_refuses_before_runtime_import(self):
        self.assert_refused_before_runtime(
            [value for value in VALID_ARGS if value != "--run-real-smoke"]
        )
        self.assert_refused_before_runtime(VALID_ARGS, environ={})
        self.assert_refused_before_runtime(
            [value for value in VALID_ARGS if value != "--accept-billable-provider-calls"]
        )
        self.assert_refused_before_runtime(VALID_ARGS[:-2])

    def test_uri_delivery_is_permanently_refused_before_runtime_import(self):
        for args in (
            [*VALID_ARGS[:-1], "uri"],
            [*VALID_ARGS[:-1], "uri", "--accept-uri-delivery-call"],
            VALID_ARGS + ["--accept-uri-delivery-call"],
            ["--preflight", "--case", "uri"],
            ["--preflight", "--accept-uri-delivery-call"],
        ):
            with self.subTest(args=args):
                code, output, factory_calls, runtime = self.invoke(args)
                self.assertEqual(code, 2)
                self.assertEqual(factory_calls, [])
                self.assertEqual(runtime.run_calls, [])
                rendered = "\n".join(output)
                self.assertIn("status: refused", rendered)
                self.assertIn("errorCategory: unsupported_delivery", rendered)
                self.assertIn("failureStage: request_validation", rendered)
                self.assertIn("create count: 0", rendered)
                self.assertIn("query count: 0", rendered)
                self.assertIn("sdkCreateEntered: false", rendered)
                self.assertIn("transportInvocationStarted: false", rendered)
                self.assertIn("providerResponseReceived: false", rendered)
                self.assertIn("httpResponseReceived: false", rendered)
                self.assertIn("network calls: 0", rendered)
                self.assertIn("temporary project created: no", rendered)
    def test_custom_provider_model_inputs_batch_and_retry_flags_are_rejected(self):
        for extra in (
            ["--provider", "google_omni"],
            ["--model", smoke.MODEL],
            ["--all"],
            ["--number-of-videos", "2"],
            ["--prompt", "custom"],
            ["--project-path", os.getcwd()],
            ["--keep-artifacts"],
            ["--retry", "1"],
        ):
            with self.subTest(extra=extra):
                self.assert_refused_before_runtime(VALID_ARGS + extra)

    def test_call_limits_are_zero_query_one_create(self):
        self.assertEqual(smoke.MAX_CREATE_ATTEMPTS, 1)
        self.assertEqual(smoke.MAX_QUERY_ATTEMPTS, 0)
        code, output, _, runtime = self.invoke(VALID_ARGS)
        self.assertEqual(code, 0)
        self.assertEqual(len(runtime.run_calls), 1)
        rendered = "\n".join(output)
        self.assertIn("Smoke A result: PASS", rendered)
        self.assertIn("create count: 1", rendered)
        self.assertIn("query count: 0", rendered)
        self.assertIn("artifactBytes: 24", rendered)

    def test_success_summary_reports_real_diagnostics_and_artifact_bytes(self):
        runtime = FakeRuntime(result=smoke.SmokeResult(
            case="t2v",
            status="success",
            artifact_ready=True,
            artifact_bytes=128,
            ftyp_valid=True,
            create_calls=1,
            query_calls=0,
            error_category="none",
            response_received=True,
            interaction_completed=True,
            video_output_present=True,
            video_bytes_present=True,
            materialization_entered=True,
            project_resolution_completed=True,
            project_configuration_state="configured",
            project_configuration_source="configured",
            client_initialization_completed=True,
            sdk_create_entered=True,
            sdk_request_serialized=True,
            transport_invocation_started=True,
            provider_response_received=True,
            failure_stage="none",
        ))
        code, output, _, _ = self.invoke(VALID_ARGS, runtime=runtime)
        self.assertEqual(code, 0)
        rendered = "\n".join(output)
        for expected in (
            "Smoke A result: PASS",
            "artifactReady: true",
            "artifactBytes: 128",
            "ftypValid: true",
            "projectResolutionCompleted: true",
            "projectConfigurationState: configured",
            "projectConfigurationSource: configured",
            "clientInitializationCompleted: true",
            "sdkCreateEntered: true",
            "sdkRequestSerialized: true",
            "transportInvocationStarted: true",
            "providerResponseReceived: true",
            "responseReceived: true",
            "interactionCompleted: true",
            "videoOutputPresent: true",
            "videoBytesPresent: true",
            "materializationEntered: true",
            "failureStage: none",
        ):
            self.assertIn(expected, rendered)
        for forbidden in ("https://", "gs://", "providerTaskId", "Interaction", "prompt", "payload"):
            self.assertNotIn(forbidden, rendered)

    def test_temp_project_and_generated_data_are_outside_repo_and_cleaned(self):
        runtime = FakeRuntime()
        code, _, _, _ = self.invoke(VALID_ARGS, runtime=runtime)
        self.assertEqual(code, 0)
        self.assertIsNotNone(runtime.project_path)
        self.assertFalse(Path(runtime.project_path).exists())

    def test_runtime_stdout_exception_text_url_and_paths_are_not_forwarded(self):
        secret = "top-secret-token"
        remote = "https://secret.invalid/video.mp4?signature=abc"
        local_path = "C:\\Users\\secret\\artifact.mp4"
        runtime = FakeRuntime(fail=RuntimeError(f"{secret} {remote} {local_path} raw response"))
        code, output, _, _ = self.invoke(VALID_ARGS, runtime=runtime)
        self.assertEqual(code, 1)
        rendered = "\n".join(output)
        self.assertNotIn(secret, rendered)
        self.assertNotIn(remote, rendered)
        self.assertNotIn(local_path, rendered)
        self.assertNotIn("raw response", rendered)
        self.assertNotIn("secret.invalid", rendered)
        self.assertIn("RuntimeError", rendered)

    def test_failure_summary_contains_only_safe_diagnostics(self):
        unsafe = "unsafe https://secret.invalid token=private C:\\secret\\file"
        runtime = FakeRuntime(result=smoke.SmokeResult(
            case="t2v", status="error", artifact_ready=False,
            create_calls=1, query_calls=0, uri_scheme="none",
            error_summary=unsafe, error_category="permission",
            http_status_class="4xx", exception_type="ForbiddenError",
            response_received=True, interaction_completed=False,
            video_output_present=False, video_bytes_present=False,
            materialization_entered=False, failure_task_persistence_check=True,
            project_resolution_completed=True, client_initialization_completed=True,
            sdk_create_entered=True, failure_stage="sdk_request_serialization",
        ))
        code, output, _, _ = self.invoke(VALID_ARGS, runtime=runtime)
        self.assertEqual(code, 1)
        rendered = "\n".join(output)
        for expected in (
            "Smoke A result: FAIL", "status: error", "create count: 1",
            "query count: 0", "errorCategory: permission",
            "httpStatusClass: 4xx", "exceptionType: ForbiddenError",
            "responseReceived: true", "failureStage: sdk_request_serialization",
            "projectResolutionCompleted: true", "failureTaskPersistenceCheck: PASS",
        ):
            self.assertIn(expected, rendered)
        for forbidden in ("secret.invalid", "private", "C:\\secret", "unsafe"):
            self.assertNotIn(forbidden, rendered)

    def test_failure_persistence_check_rejects_sensitive_or_noncanonical_records(self):
        with tempfile.TemporaryDirectory() as project_path:
            task_id = "video_safe"
            task_dir = Path(project_path) / "tasks"
            task_dir.mkdir()
            task = type("Task", (), {"id": task_id})()
            safe = {
                "id": task_id, "schemaVersion": "v2", "provider": "google_omni",
                "model": smoke.MODEL, "videoMode": "text-to-video", "status": "error",
                "progress": 0, "message": "Gemini Omni video generation failed.",
                "outputs": {}, "createdAt": 1, "updatedAt": 1,
                "error": "Gemini Omni video generation failed.",
            }
            task_file = task_dir / "video_tasks.json"
            task_file.write_text(json.dumps({task_id: safe}), encoding="utf-8")
            self.assertTrue(smoke._validate_failure_persistence(project_path, task))
            unsafe = {**safe, "providerTaskId": "remote-id"}
            task_file.write_text(json.dumps({task_id: unsafe}), encoding="utf-8")
            self.assertFalse(smoke._validate_failure_persistence(project_path, task))

    def test_uri_scheme_classification_is_safe_and_coarse(self):
        self.assertEqual(smoke._classify_uri("https://host.invalid/path?token=secret"), "https")
        self.assertEqual(smoke._classify_uri("gs://bucket/object"), "gs")
        self.assertEqual(smoke._classify_uri("files/resource-name"), "files")
        self.assertEqual(smoke._classify_uri("file://local/resource"), "files")
        self.assertEqual(smoke._classify_uri("custom://opaque"), "custom")

    def test_request_contract_checks_inline_roles_and_prohibited_fields(self):
        image = interactions.ImageContent(data="iVBORw0KGgo=", mime_type="image/png")
        cases = {
            "t2v": [interactions.TextContent(text=f"prompt {smoke.DURATION_GUIDANCE}")],
            "i2v": [interactions.TextContent(text=f"<FIRST_FRAME> prompt {smoke.DURATION_GUIDANCE}"), image],
            "reference": [
                interactions.TextContent(text=f"<IMAGE_REF_0> <IMAGE_REF_1> prompt {smoke.DURATION_GUIDANCE}"),
                image,
                image,
            ],
        }
        for case, content in cases.items():
            with self.subTest(case=case):
                plan = FakeRuntime().validate_plan(case)
                request = interactions.CreateModelInteraction(
                    model=smoke.MODEL,
                    input=content,
                    generation_config=interactions.GenerationConfig(
                        video_config=interactions.VideoConfig(task=plan.task)
                    ),
                    response_format=interactions.VideoResponseFormat(
                        type="video", aspect_ratio="16:9", delivery="inline"
                    ),
                    background=False,
                    store=False,
                    stream=False,
                )
                smoke._validate_request_contract(request, plan)

        invalid = interactions.CreateModelInteraction(
            model=smoke.MODEL,
            input=f"prompt {smoke.DURATION_GUIDANCE}",
            generation_config=interactions.GenerationConfig(
                video_config=interactions.VideoConfig(task="text_to_video")
            ),
            response_format=interactions.VideoResponseFormat(
                type="video", aspect_ratio="16:9", delivery="inline", duration="8s"
            ),
            background=False,
            store=False,
            stream=False,
        )
        with self.assertRaises(smoke.GateError):
            smoke._validate_request_contract(invalid, FakeRuntime().validate_plan("t2v"))

    def test_preflight_is_gate_free_and_never_runs_a_smoke_project(self):
        code, output, factory_calls, runtime = self.invoke(["--preflight"], environ={})
        self.assertEqual(code, 0)
        self.assertEqual(factory_calls, [True])
        self.assertEqual(runtime.validate_calls, ["t2v"])
        self.assertEqual(len(runtime.preflight_calls), 1)
        self.assertEqual(runtime.run_calls, [])
        self.assertIsNone(runtime.project_path)
        self.assertEqual(output, [
            "Runtime configuration preflight: PASS",
            "project resolution: PASS",
            "projectConfigurationState: configured",
            "projectConfigurationSource: configured",
            "client created: no",
            "network calls: 0",
            "credential reads: 0",
            "temporary project created: no",
            "SDK contract preflight: PASS",
            "project resolution contract: PASS",
            "client construction contract: PASS",
            "request validation: PASS",
            "request serialization: PASS",
            "mock transport reached: true",
            "network calls: 0",
            "credential reads: 0",
            "temporary project created: no",
        ])

    def test_backend_environment_bootstrap_loads_dotenv_without_reporting_values(self):
        from video_generation.providers.google_omni_provider import GoogleOmniProvider

        environment = {
            key: value
            for key, value in os.environ.items()
            if key not in {"GOOGLE_CLOUD_PROJECT", "GOOGLE_PROJECT_ID", "GOOGLE_PROJECT"}
        }
        with tempfile.TemporaryDirectory() as temp_cwd:
            Path(temp_cwd, ".env").write_text("GOOGLE_CLOUD_PROJECT=mock-project\n", encoding="utf-8")
            previous_cwd = os.getcwd()
            try:
                os.chdir(temp_cwd)
                with patch.dict(os.environ, environment, clear=True):
                    smoke._bootstrap_backend_environment()
                    state = GoogleOmniProvider().runtime_project_configuration()
            finally:
                os.chdir(previous_cwd)
        self.assertTrue(state.passed)
        self.assertEqual(state.state, "configured")
        self.assertEqual(state.source, "configured")

    def test_preflight_rejects_real_flags_non_t2v_cases_and_custom_inputs(self):
        rejected = (
            ["--preflight", "--run-real-smoke"],
            ["--preflight", "--accept-billable-provider-calls"],
            ["--preflight", "--accept-uri-delivery-call"],
            ["--preflight", "--case", "i2v"],
            ["--preflight", "--case", "reference"],
            ["--preflight", "--case", "uri"],
            ["--preflight", "--provider", smoke.PROVIDER],
            ["--preflight", "--model", smoke.MODEL],
            ["--preflight", "--prompt", "custom"],
            ["--preflight", "--all"],
            ["--preflight", "--number-of-videos", "2"],
        )
        for args in rejected:
            with self.subTest(args=args):
                code, output, factory_calls, _ = self.invoke(args, environ={})
                self.assertEqual(code, 2)
                self.assertEqual(factory_calls, [])
                self.assertNotIn("Traceback", "\n".join(output))

    def test_import_failure_precedes_temp_project_and_runtime_activity(self):
        output = []
        with patch.object(smoke, "_external_temp_root") as temp_root:
            code = smoke.main(
                VALID_ARGS,
                environ=VALID_ENV,
                runtime_factory=lambda: (_ for _ in ()).throw(ModuleNotFoundError("safe")),
                output=output.append,
            )
        self.assertEqual(code, 1)
        temp_root.assert_not_called()
        self.assertEqual(output, ["GOOGLE OMNI REAL SMOKE FAILED: runtime error (ModuleNotFoundError)"])

    def test_plan_uses_canonical_duration_and_preflight_runs_before_temp(self):
        runtime = FakeRuntime()
        code, _, _, _ = self.invoke(VALID_ARGS, runtime=runtime)
        self.assertEqual(code, 0)
        self.assertEqual(runtime.validate_calls, ["t2v"])
        self.assertEqual(runtime.preflight_calls[0].duration, "5s")
        self.assertEqual(runtime.run_calls[0].duration, "5s")

    def test_root_script_preflight_loads_production_chain_without_real_gates(self):
        repository = Path(__file__).resolve().parents[2]
        script = repository / "backend" / "scripts" / "run_google_omni_real_smoke.py"
        environment = os.environ.copy()
        environment["PYTHONDONTWRITEBYTECODE"] = "1"
        environment["NODE_CANVAS_RUN_VIDEO_SMOKE"] = "0"
        environment[smoke.ENABLE_ENV] = "0"
        environment.pop("GOOGLE_CLOUD_PROJECT", None)
        environment.pop("GOOGLE_PROJECT_ID", None)
        environment.pop("GOOGLE_PROJECT", None)
        with tempfile.TemporaryDirectory() as temp_cwd:
            Path(temp_cwd, ".env").write_text("GOOGLE_CLOUD_PROJECT=mock-project\n", encoding="utf-8")
            completed = subprocess.run(
                [sys.executable, "-B", str(script), "--preflight"],
                cwd=temp_cwd,
                env=environment,
                capture_output=True,
                text=True,
                check=False,
            )
        self.assertEqual(completed.returncode, 0, completed.stdout)
        self.assertEqual(completed.stderr, "")
        self.assertIn("Runtime configuration preflight: PASS", completed.stdout)
        self.assertIn("project resolution: PASS", completed.stdout)
        self.assertIn("projectConfigurationState: configured", completed.stdout)
        self.assertNotIn("mock-project", completed.stdout)
        self.assertIn("projectConfigurationSource: configured", completed.stdout)
        self.assertIn("SDK contract preflight: PASS", completed.stdout)
        self.assertIn("request serialization: PASS", completed.stdout)
        self.assertIn("mock transport reached: true", completed.stdout)
        self.assertIn("credential reads: 0", completed.stdout)
        self.assertIn("temporary project created: no", completed.stdout)
        self.assertIn("network calls: 0", completed.stdout)
        self.assertNotIn("Traceback", completed.stdout)


    def test_runtime_configuration_failure_precedes_temp_project_client_and_task(self):
        runtime = FakeRuntime(runtime_configuration=(False, "missing", "absent"))
        output = []
        with patch.object(smoke, "_external_temp_root") as temp_root:
            code = smoke.main(
                VALID_ARGS,
                environ=VALID_ENV,
                runtime_factory=lambda: runtime,
                output=output.append,
            )
        self.assertEqual(code, 2)
        temp_root.assert_not_called()
        self.assertEqual(runtime.run_calls, [])
        self.assertIsNone(runtime.project_path)
        rendered = "\n".join(output)
        self.assertIn("Runtime configuration preflight: FAIL", rendered)
        self.assertIn("project resolution: FAIL", rendered)
        self.assertIn("projectConfigurationState: missing", rendered)
        self.assertIn("projectConfigurationSource: absent", rendered)
        self.assertIn("client created: no", rendered)
        self.assertIn("Temporary project cleanup: N/A", rendered)
        self.assertNotIn("mock-project", rendered)

    def test_cleanup_retries_only_the_owned_project_and_is_bounded(self):
        with tempfile.TemporaryDirectory() as root_value:
            root = Path(root_value)
            owned = root / f"{smoke.TEMP_PROJECT_PREFIX}locked"
            owned.mkdir()
            actual_rmtree = smoke.shutil.rmtree
            calls = []

            def locked_twice(path):
                calls.append(Path(path))
                if len(calls) < smoke.TEMP_CLEANUP_ATTEMPTS:
                    raise PermissionError("locked")
                actual_rmtree(path)

            with patch.object(smoke.shutil, "rmtree", side_effect=locked_twice):
                cleaned = smoke._cleanup_owned_temp_project(
                    owned,
                    root,
                    attempts=smoke.TEMP_CLEANUP_ATTEMPTS,
                    delay_seconds=0,
                )
            self.assertTrue(cleaned)
            self.assertEqual(calls, [owned.resolve()] * smoke.TEMP_CLEANUP_ATTEMPTS)
            self.assertFalse(owned.exists())

    def test_cleanup_refuses_unowned_directory_and_reports_final_failure(self):
        with tempfile.TemporaryDirectory() as root_value:
            root = Path(root_value)
            unowned = root / "unowned"
            unowned.mkdir()
            self.assertFalse(
                smoke._cleanup_owned_temp_project(unowned, root, attempts=1, delay_seconds=0)
            )
            self.assertTrue(unowned.exists())

            runtime = FakeRuntime()
            output = []
            with (
                patch.object(smoke, "_external_temp_root", return_value=root),
                patch.object(smoke, "_cleanup_owned_temp_project", return_value=False),
            ):
                code = smoke.main(
                    VALID_ARGS,
                    environ=VALID_ENV,
                    runtime_factory=lambda: runtime,
                    output=output.append,
                )
            self.assertEqual(code, 1)
            self.assertIn("Temporary project cleanup: FAIL", output)
            self.assertNotIn("Smoke A result: PASS", output)
            if runtime.project_path:
                actual = Path(runtime.project_path)
                if actual.exists():
                    smoke.shutil.rmtree(actual)

    def test_smoke_module_is_not_imported_by_application_entrypoints(self):
        backend = Path(__file__).resolve().parents[1]
        for relative in ("main.py", "video_generation/service.py", "video_generation/adapters/registry.py"):
            source = (backend / relative).read_text(encoding="utf-8-sig")
            self.assertNotIn("run_google_omni_real_smoke", source)


if __name__ == "__main__":
    unittest.main()
