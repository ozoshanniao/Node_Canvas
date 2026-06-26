import asyncio
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from video_generation.adapters.types import VideoCreateRequest, VideoCreateResult, VideoQueryResult
from video_generation.schemas import VideoGenerateRequest, VideoTask
from video_generation.service import VideoGenerationService
from video_generation.tasks import get_task, upsert_task


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


class VideoServiceCanonicalResultsTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.project = Path(self.temp_dir.name) / "project"
        self.project.mkdir(parents=True)
        self.task_file = self.project / "tasks" / "video_tasks.json"

    def tearDown(self):
        self.temp_dir.cleanup()

    def read_store(self):
        return json.loads(self.task_file.read_text(encoding="utf-8"))

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

    def test_create_service_trusts_only_canonical_result(self):
        service = VideoGenerationService(yunwu_api_key="mock")
        adapter = FakeAdapter(create_result=VideoCreateResult(
            provider="google",
            model="veo-3.1-generate-001",
            task_id="canonical-task-id",
            status="queued",
            message="canonical message",
            raw_response={
                "task_id": "raw-wrong-task-id",
                "status": "failed",
                "video_url": "raw-wrong-url"
            },
        ))
        request = VideoGenerateRequest(
            projectPath=str(self.project),
            provider="google",
            model="veo-3.1-generate-001",
            videoMode="text-to-video",
            prompt="test prompt",
        )

        with patch("video_generation.service.get_video_adapter", return_value=adapter):
            task = run(service.create_task(str(self.project), request))

        self.assertEqual(task.providerTaskId, "canonical-task-id")
        self.assertEqual(task.status, "queued")
        self.assertEqual(task.message, "canonical message")

        stored = self.read_store()[task.id]
        self.assertEqual(stored["providerTaskId"], "canonical-task-id")
        self.assertEqual(stored["status"], "queued")
        self.assertEqual(stored["message"], "canonical message")

        serialized = json.dumps(stored)
        self.assertNotIn("raw-wrong-task-id", serialized)
        self.assertNotIn("failed", serialized)
        self.assertNotIn("raw-wrong-url", serialized)

    def test_query_service_trusts_only_canonical_result_running(self):
        task = self.canonical_task()
        run(upsert_task(str(self.project), task))
        service = VideoGenerationService(yunwu_api_key="mock")
        adapter = FakeAdapter(query_result=VideoQueryResult(
            provider="google",
            model=task.model,
            task_id=task.providerTaskId,
            status="running",
            message="still running",
            raw_response={
                "status": "failed"
            },
        ))

        with patch("video_generation.service.get_video_adapter", return_value=adapter):
            updated = run(service.query_task(str(self.project), task.id))

        self.assertEqual(updated.status, "running")
        self.assertEqual(updated.message, "still running")

        stored = self.read_store()[task.id]
        self.assertEqual(stored["status"], "running")
        self.assertNotIn("failed", json.dumps(stored))

    def test_query_service_trusts_only_canonical_result_success(self):
        task = self.canonical_task()
        run(upsert_task(str(self.project), task))
        service = VideoGenerationService(yunwu_api_key="mock")
        adapter = FakeAdapter(query_result=VideoQueryResult(
            provider="google",
            model=task.model,
            task_id=task.providerTaskId,
            status="succeeded",
            video_bytes=b"fake-video-bytes",
            raw_response={
                "status": "failed",
                "video_url": "raw-wrong-url"
            },
        ))

        with patch("video_generation.service.get_video_adapter", return_value=adapter):
            updated = run(service.query_task(str(self.project), task.id))

        self.assertEqual(updated.status, "success")
        self.assertEqual(updated.message, "Video generation completed.")

        stored = self.read_store()[task.id]
        self.assertEqual(stored["status"], "success")
        self.assertNotIn("failed", json.dumps(stored))
        self.assertNotIn("raw-wrong-url", json.dumps(stored))
        self.assertIn("video", stored["outputs"])

        video_path = self.project / stored["outputs"]["video"]["relativePath"]
        self.assertTrue(video_path.exists())
        self.assertEqual(video_path.read_bytes(), b"fake-video-bytes")

    def test_query_service_trusts_only_canonical_result_failed(self):
        task = self.canonical_task()
        run(upsert_task(str(self.project), task))
        service = VideoGenerationService(yunwu_api_key="mock")
        adapter = FakeAdapter(query_result=VideoQueryResult(
            provider="google",
            model=task.model,
            task_id=task.providerTaskId,
            status="failed",
            message="canonical error",
            raw_response={
                "status": "succeeded",
                "video_url": "fake-success-url"
            },
        ))

        with patch("video_generation.service.get_video_adapter", return_value=adapter):
            updated = run(service.query_task(str(self.project), task.id))

        self.assertEqual(updated.status, "error")
        self.assertTrue("canonical error" in updated.error)
        self.assertNotIn("succeeded", updated.message)

        stored = self.read_store()[task.id]
        self.assertEqual(stored["status"], "error")
        self.assertNotIn("succeeded", json.dumps(stored))
        self.assertNotIn("fake-success-url", json.dumps(stored))
        self.assertEqual(stored["outputs"], {})

    def test_seedance_provider_label_baseline(self):
        task = self.canonical_task(provider="seedance_official", model="seedance")
        run(upsert_task(str(self.project), task))
        service = VideoGenerationService(yunwu_api_key="mock")
        adapter = FakeAdapter(query_result=VideoQueryResult(
            provider="seedance_official",
            model=task.model,
            task_id=task.providerTaskId,
            status="succeeded",
            video_bytes=b"fake-video-bytes",
            last_frame_url="https://fake.example/last_frame.jpg",
            raw_response={
                "status": "failed"
            },
        ))

        async def fake_download_image(project_path, remote_url, filename_stem):
            self.assertEqual(remote_url, "https://fake.example/last_frame.jpg")
            rel_path = f"generation/images/{filename_stem}.jpg"
            abs_path = Path(project_path) / rel_path
            abs_path.parent.mkdir(parents=True, exist_ok=True)
            abs_path.write_bytes(b"fake-image")
            return {"relativePath": rel_path}

        with (
            patch("video_generation.service.get_video_adapter", return_value=adapter),
            patch("video_generation.service.download_image_to_generation", side_effect=fake_download_image)
        ):
            updated = run(service.query_task(str(self.project), task.id))

        self.assertEqual(updated.status, "success")
        stored = self.read_store()[task.id]
        self.assertEqual(stored["status"], "success")
        self.assertIn("video", stored["outputs"])
        self.assertIn("lastFrame", stored["outputs"])
        self.assertTrue(stored["outputs"]["lastFrame"]["relativePath"].startswith("generation/images/"))

if __name__ == "__main__":
    unittest.main()
