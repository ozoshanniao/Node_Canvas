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

    def test_url_video_success_persists_only_safe_relative_artifact(self):
        task = self.canonical_task(
            id="video-task-1",
            provider="kling",
            model="kling-v3",
        )
        run(upsert_task(str(self.project), task))
        service = VideoGenerationService(yunwu_api_key="mock")
        remote_url = "https://media.invalid/video.mp4?X-Amz-Signature=fake"
        adapter = FakeAdapter(query_result=VideoQueryResult(
            provider="kling",
            model=task.model,
            task_id=task.providerTaskId,
            status="succeeded",
            video_url=remote_url,
            raw_response={
                "video_url": "https://raw.invalid/should-not-persist.mp4?token=secret",
                "absolutePath": r"C:\temp\partial.mp4",
            },
        ))

        async def fake_download(project_path, received_url, task_id):
            self.assertEqual(received_url, remote_url)
            relative_path = f"generation/videos/{task_id}.mp4"
            artifact = Path(project_path) / relative_path
            artifact.parent.mkdir(parents=True, exist_ok=True)
            artifact.write_bytes(b"synthetic-url-video")
            return f"/api/video/{task_id}.mp4"

        with (
            patch("video_generation.service.get_video_adapter", return_value=adapter),
            patch("video_generation.service.download_video_to_project", side_effect=fake_download) as download,
        ):
            updated = run(service.query_task(str(self.project), task.id))

        expected_path = "generation/videos/video-task-1.mp4"
        self.assertEqual(updated.status, "success")
        self.assertEqual(updated.outputs, {"video": {"relativePath": expected_path}})
        download.assert_awaited_once_with(str(self.project), remote_url, task.id)
        stored = self.read_store()[task.id]
        self.assertEqual(stored["status"], "success")
        self.assertEqual(stored["providerTaskId"], "provider-task-a")
        self.assertEqual(stored["outputs"], {"video": {"relativePath": expected_path}})
        self.assertNotIn("outputVideoPath", stored)
        self.assertNotIn("outputVideoUrl", stored)
        serialized = json.dumps(stored)
        for forbidden in ("http://", "https://", "X-Amz-Signature", "token=secret", "C:\\temp", "raw_response"):
            self.assertNotIn(forbidden, serialized)

    def test_video_bytes_success_uses_save_path_without_url_download(self):
        task = self.canonical_task(id="video-bytes-1")
        run(upsert_task(str(self.project), task))
        service = VideoGenerationService(yunwu_api_key="mock")
        video_bytes = b"synthetic-google-video"
        adapter = FakeAdapter(query_result=VideoQueryResult(
            provider="google",
            model=task.model,
            task_id=task.providerTaskId,
            status="succeeded",
            video_bytes=video_bytes,
            raw_response={
                "remoteVideoUrl": "https://raw.invalid/should-not-persist.mp4",
                "absolutePath": "/tmp/should-not-persist.mp4",
            },
        ))

        def fake_save(project_path, received_bytes, task_id):
            self.assertEqual(received_bytes, video_bytes)
            relative_path = f"generation/videos/{task_id}.mp4"
            artifact = Path(project_path) / relative_path
            artifact.parent.mkdir(parents=True, exist_ok=True)
            artifact.write_bytes(received_bytes)
            return str(artifact)

        with (
            patch("video_generation.service.get_video_adapter", return_value=adapter),
            patch("video_generation.service.save_video_bytes_to_project", side_effect=fake_save) as save,
            patch("video_generation.service.download_video_to_project") as download,
        ):
            updated = run(service.query_task(str(self.project), task.id))

        expected_path = "generation/videos/video-bytes-1.mp4"
        self.assertEqual(updated.status, "success")
        save.assert_called_once_with(str(self.project), video_bytes, task.id)
        download.assert_not_called()
        stored = self.read_store()[task.id]
        self.assertEqual(stored["status"], "success")
        self.assertEqual(stored["providerTaskId"], "provider-task-a")
        self.assertEqual(stored["outputs"], {"video": {"relativePath": expected_path}})
        serialized = json.dumps(stored)
        for forbidden in ("http://", "https://", "raw.invalid", "/tmp/", "raw_response"):
            self.assertNotIn(forbidden, serialized)

    def test_main_video_download_failure_is_interrupted_without_artifact_fallback(self):
        task = self.canonical_task(
            id="video-download-failure-1",
            provider="kling",
            model="kling-v3",
        )
        run(upsert_task(str(self.project), task))
        service = VideoGenerationService(yunwu_api_key="mock")
        remote_url = "https://media.invalid/failure.mp4?X-Amz-Signature=fake"
        adapter = FakeAdapter(query_result=VideoQueryResult(
            provider="kling",
            model=task.model,
            task_id=task.providerTaskId,
            status="succeeded",
            video_url=remote_url,
            last_frame_url="https://media.invalid/last-frame.png",
        ))

        async def failing_download(project_path, received_url, task_id):
            partial = Path(project_path) / "generation" / "videos" / "partial-download.tmp"
            partial.parent.mkdir(parents=True, exist_ok=True)
            partial.write_bytes(b"partial")
            raise RuntimeError("synthetic non-2xx download failure")

        with (
            patch("video_generation.service.get_video_adapter", return_value=adapter),
            patch("video_generation.service.download_video_to_project", side_effect=failing_download) as download,
            patch.object(service, "_download_seedance_last_frame") as last_frame_download,
        ):
            updated = run(service.query_task(str(self.project), task.id))

        self.assertEqual(updated.status, "interrupted")
        self.assertEqual(updated.providerTaskId, "provider-task-a")
        self.assertEqual(updated.outputs, {})
        download.assert_awaited_once_with(str(self.project), remote_url, task.id)
        last_frame_download.assert_not_called()
        stored = self.read_store()[task.id]
        self.assertEqual(stored["status"], "interrupted")
        self.assertEqual(stored["providerTaskId"], "provider-task-a")
        self.assertEqual(stored["outputs"], {})
        serialized = json.dumps(stored)
        for forbidden in (remote_url, "X-Amz-Signature", "partial-download.tmp", "last-frame.png"):
            self.assertNotIn(forbidden, serialized)

    def test_success_with_existing_local_artifact_returns_without_query_or_rewrite(self):
        relative_path = "generation/videos/existing-video.mp4"
        artifact = self.project / relative_path
        artifact.parent.mkdir(parents=True, exist_ok=True)
        artifact.write_bytes(b"existing-video")
        task = self.canonical_task(
            id="existing-video-task",
            status="success",
            progress=100,
            message="done",
            outputs={"video": {"relativePath": relative_path}},
        )
        run(upsert_task(str(self.project), task))
        before = self.task_file.read_bytes()
        service = VideoGenerationService(yunwu_api_key="mock")
        adapter = FakeAdapter(query_result=VideoQueryResult(
            provider="google",
            model=task.model,
            task_id=task.providerTaskId,
            status="succeeded",
            video_bytes=b"replacement",
        ))

        with (
            patch("video_generation.service.get_video_adapter", return_value=adapter) as get_adapter,
            patch("video_generation.service.download_video_to_project") as download,
            patch("video_generation.service.save_video_bytes_to_project") as save,
        ):
            updated = run(service.query_task(str(self.project), task.id))

        self.assertEqual(updated.status, "success")
        self.assertEqual(updated.outputs, {"video": {"relativePath": relative_path}})
        self.assertEqual(adapter.queried, [])
        get_adapter.assert_not_called()
        download.assert_not_called()
        save.assert_not_called()
        self.assertEqual(artifact.read_bytes(), b"existing-video")
        self.assertEqual(self.task_file.read_bytes(), before)

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
