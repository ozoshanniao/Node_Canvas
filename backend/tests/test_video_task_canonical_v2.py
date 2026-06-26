import asyncio
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from video_generation.adapters.types import VideoCreateRequest, VideoCreateResult, VideoQueryResult
from video_generation.schemas import MAX_TASK_TEXT_LENGTH, VideoGenerateRequest, VideoTask
from video_generation.service import VideoGenerationService
from video_generation.tasks import (
    get_task,
    load_tasks,
    normalize_relative_artifact_path,
    task_api_data,
    upsert_task,
)


def run(coro):
    return asyncio.run(coro)


class FakeAdapter:
    def __init__(self, *, create_result=None, query_result=None):
        self.create_result = create_result
        self.query_result = query_result
        self.created = []
        self.queried = []

    async def create(self, request, capability):
        self.created.append((request, capability))
        return self.create_result

    async def query(self, request, capability):
        self.queried.append((request, capability))
        return self.query_result

    def create_request_from_generate_request(self, request):
        return VideoCreateRequest(
            provider=request.provider,
            model=request.model,
            task_type=request.videoMode,
            prompt=request.prompt,
            project_dir=request.projectPath,
        )


class VideoTaskCanonicalV2Test(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.project = Path(self.temp_dir.name) / "project"
        self.project.mkdir(parents=True)

    def tearDown(self):
        self.temp_dir.cleanup()

    @property
    def task_file(self):
        return self.project / "tasks" / "video_tasks.json"

    def read_store(self):
        return json.loads(self.task_file.read_text(encoding="utf-8"))

    def write_store(self, data):
        self.task_file.parent.mkdir(parents=True, exist_ok=True)
        self.task_file.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    def make_video_file(self, relative_path):
        path = self.project / relative_path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b"video")
        return path

    def canonical_task(self, **patches):
        data = {
            "id": "video_task_a",
            "schemaVersion": "v2",
            "provider": "google",
            "model": "veo-3.1-generate-001",
            "videoMode": "text-to-video",
            "status": "running",
            "progress": 60,
            "message": "running",
            "providerTaskId": "provider-task-a",
            "outputs": {},
            "requestSnapshot": {},
            "createdAt": 1,
            "updatedAt": 2,
        }
        data.update(patches)
        return VideoTask(**data)

    def test_new_service_create_persists_only_canonical_v2_fields(self):
        service = VideoGenerationService(yunwu_api_key="mock")
        adapter = FakeAdapter(create_result=VideoCreateResult(
            provider="google",
            model="veo-3.1-generate-001",
            task_id="operations/create-1",
            status="running",
            message="submitted",
            raw_response={
                "Authorization": "Bearer should-not-persist",
                "remoteVideoUrl": "https://signed.example/video.mp4?token=secret",
                "request": {"prompt": "secret prompt"},
            },
        ))
        request = VideoGenerateRequest(
            projectPath=str(self.project),
            provider="google",
            model="veo-3.1-generate-001",
            videoMode="text-to-video",
            prompt="must not persist",
            images=["https://input.example/image.png?sig=x"],
            customParams={"unknown": {"token": "must not persist"}},
        )

        with patch("video_generation.service.get_video_adapter", return_value=adapter):
            task = run(service.create_task(str(self.project), request))

        stored = self.read_store()[task.id]
        self.assertEqual(stored["schemaVersion"], "v2")
        self.assertEqual(stored["providerTaskId"], "operations/create-1")
        self.assertEqual(stored["outputs"], {})
        serialized = json.dumps(stored)
        for forbidden in (
            "rawCreateResponse", "rawQueryResponse", "remoteVideoUrl", "localVideoUrl",
            "projectPath", "prompt", "customParams", "signed.example", "should-not-persist",
        ):
            self.assertNotIn(forbidden, serialized)
        self.assertNotIn("request", stored)
        self.assertNotIn("requestSnapshot", stored)

    def test_query_success_persists_relative_path_and_api_derives_url(self):
        task = self.canonical_task()
        run(upsert_task(str(self.project), task))
        service = VideoGenerationService(yunwu_api_key="mock")
        adapter = FakeAdapter(query_result=VideoQueryResult(
            provider="google",
            model=task.model,
            task_id=task.providerTaskId,
            status="succeeded",
            video_url="https://signed.example/video.mp4?Signature=secret",
            raw_status="completed",
            raw_response={"raw": {"token": "must-not-persist"}},
        ))

        async def fake_download(project_path, remote_url, task_id):
            self.assertIn("Signature=secret", remote_url)
            self.make_video_file(f"generation/videos/{task_id}.mp4")
            return f"/api/video/{task_id}.mp4"

        with (
            patch("video_generation.service.get_video_adapter", return_value=adapter),
            patch("video_generation.service.download_video_to_project", side_effect=fake_download),
        ):
            updated = run(service.query_task(str(self.project), task.id))

        stored = self.read_store()[task.id]
        self.assertEqual(stored["outputs"], {"video": {"relativePath": f"generation/videos/{task.id}.mp4"}})
        self.assertNotIn("remoteVideoUrl", json.dumps(stored))
        self.assertNotIn("signed.example", json.dumps(stored))
        api_data = task_api_data(updated)
        self.assertEqual(api_data["localVideoUrl"], f"/api/video/{task.id}.mp4")
        self.assertEqual(api_data["outputs"]["videoUrl"], f"/api/video/{task.id}.mp4")

    def test_path_safety_rejects_urls_absolute_escape_unc_and_query(self):
        invalid = [
            "C:/project/generation/videos/a.mp4",
            "file:///project/generation/videos/a.mp4",
            "https://example.test/a.mp4",
            "generation/videos/a.mp4?token=x",
            "generation/videos/../a.mp4",
            "../generation/videos/a.mp4",
            "//server/share/a.mp4",
            r"\\server\share\a.mp4",
            "",
        ]
        for value in invalid:
            with self.subTest(value=value):
                self.assertIsNone(normalize_relative_artifact_path(
                    str(self.project), value, kind="video", require_exists=False
                ))
        self.assertEqual(
            normalize_relative_artifact_path(
                str(self.project), "generation/videos/a.mp4", kind="video", require_exists=False
            ),
            "generation/videos/a.mp4",
        )
        self.assertIsNone(normalize_relative_artifact_path(
            str(self.project), "/api/video/a.mp4", kind="video", require_exists=False
        ))

    def test_error_text_is_redacted_query_stripped_and_truncated(self):
        dangerous = (
            "Traceback (most recent call last):\nline one\n"
            "Authorization: Bearer abc token=xyz AccessKey=ak Secret=sk "
            "https://example.test/failure?Signature=secret#fragment " + ("x" * 900)
        )
        task = self.canonical_task(status="error", message=dangerous, error=dangerous)
        stored_task = run(upsert_task(str(self.project), task))
        stored = self.read_store()[task.id]
        serialized = json.dumps(stored)
        for forbidden in ("Bearer abc", "token=xyz", "AccessKey=ak", "Secret=sk", "Signature=secret", "#fragment"):
            self.assertNotIn(forbidden, serialized)
        self.assertNotIn("line one", serialized)
        self.assertLessEqual(len(stored_task.message), MAX_TASK_TEXT_LENGTH)
        self.assertLessEqual(len(stored_task.error or ""), MAX_TASK_TEXT_LENGTH)

    def test_legacy_load_is_in_memory_only_and_remote_only_success_is_not_playable(self):
        video_path = "generation/videos/legacy-local.mp4"
        self.make_video_file(video_path)
        legacy = {
            "local": {
                "id": "local",
                "provider": "google",
                "model": "veo",
                "videoMode": "text-to-video",
                "status": "success",
                "progress": 100,
                "message": "done",
                "providerTaskId": "provider-local",
                "localVideoUrl": video_path,
                "remoteVideoUrl": "https://signed.example/local.mp4?token=x",
                "outputs": {"rawQueryResponse": {"secret": "x"}},
                "request": {"prompt": "old"},
                "createdAt": 1,
                "updatedAt": 2,
            },
            "remote": {
                "id": "remote",
                "provider": "seedance_official",
                "model": "seedance",
                "videoMode": "frame",
                "status": "success",
                "progress": 100,
                "message": "done",
                "providerTaskId": "provider-remote",
                "remoteVideoUrl": "https://signed.example/remote.mp4?token=x",
                "outputs": {"videoUrl": "https://signed.example/remote.mp4?token=x"},
                "request": {"projectPath": "C:/secret"},
                "createdAt": 1,
                "updatedAt": 2,
            },
        }
        self.write_store(legacy)
        before = self.task_file.read_bytes()
        loaded = run(load_tasks(str(self.project)))
        after = self.task_file.read_bytes()

        self.assertEqual(before, after)
        self.assertEqual(loaded["local"]["schemaVersion"], "v2")
        self.assertEqual(loaded["local"]["status"], "success")
        self.assertEqual(loaded["local"]["outputs"]["video"]["relativePath"], video_path)
        self.assertEqual(loaded["remote"]["status"], "interrupted")
        self.assertEqual(loaded["remote"]["outputs"], {})
        serialized = json.dumps(loaded)
        for forbidden in ("rawQueryResponse", "remoteVideoUrl", "signed.example", "projectPath", "prompt"):
            self.assertNotIn(forbidden, serialized)

    def test_lazy_writeback_updates_only_touched_legacy_record(self):
        legacy_a = {
            "id": "a", "provider": "google", "model": "veo", "videoMode": "text-to-video",
            "status": "running", "progress": 50, "message": "running", "providerTaskId": "pa",
            "rawCreateResponse": {"secret": "a"}, "request": {"prompt": "a"}, "createdAt": 1, "updatedAt": 1,
        }
        legacy_b = {
            "id": "b", "provider": "kling", "model": "kling", "videoMode": "text-to-video",
            "status": "running", "progress": 50, "message": "running", "providerTaskId": "pb",
            "rawCreateResponse": {"secret": "b"}, "request": {"prompt": "b"}, "createdAt": 1, "updatedAt": 1,
        }
        self.write_store({"a": legacy_a, "b": legacy_b})
        task_a = run(get_task(str(self.project), "a"))
        run(upsert_task(str(self.project), task_a.model_copy(update={"progress": 60, "updatedAt": 2})))
        stored = self.read_store()

        self.assertEqual(stored["a"]["schemaVersion"], "v2")
        self.assertNotIn("rawCreateResponse", stored["a"])
        self.assertEqual(stored["b"], legacy_b)

    def test_recovery_fields_are_provider_neutral_and_minimal(self):
        for provider in ("yunwu", "google", "kling", "yunwu-kling", "kie", "seedance_official"):
            with self.subTest(provider=provider):
                task = self.canonical_task(
                    id=f"task-{provider}",
                    provider=provider,
                    model=f"model-{provider}",
                    videoMode="frame" if provider == "seedance_official" else "text-to-video",
                    providerTaskId=f"provider-{provider}",
                    requestSnapshot={
                        "prompt": "must be removed",
                        "customParams": {"token": "must be removed"},
                        "endpoint": "https://secret.example",
                    },
                )
                run(upsert_task(str(self.project), task))
                stored = self.read_store()[task.id]
                self.assertEqual(stored["provider"], provider)
                self.assertEqual(stored["model"], f"model-{provider}")
                self.assertEqual(stored["providerTaskId"], f"provider-{provider}")
                self.assertNotIn("requestSnapshot", stored)
                serialized = json.dumps(stored)
                for forbidden in ("prompt", "customParams", "endpoint", "secret.example", "raw"):
                    self.assertNotIn(forbidden, serialized)


if __name__ == "__main__":
    unittest.main()
