import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

import generation_media


class GenerationMediaHelperTest(unittest.TestCase):
    def _temporary_project(self):
        temp_root = Path("C:/tmp")
        temp_root.mkdir(parents=True, exist_ok=True)
        return TemporaryDirectory(dir=temp_root)

    def test_safe_generation_token_cleans_dangerous_characters(self):
        self.assertEqual(generation_media.safe_generation_token("curve:1/unsafe"), "curve_1_unsafe")
        self.assertEqual(generation_media.safe_generation_token("../bad\\path"), "bad_path")
        self.assertEqual(generation_media.safe_generation_token(""), "unknown")

    def test_resolve_project_generation_path_rejects_traversal(self):
        with self._temporary_project() as project_dir:
            resolved = generation_media.resolve_generation_path(project_dir, "ease_curve/video.mp4")
            generation_dir = (Path(project_dir) / "generation").resolve()

            self.assertEqual(resolved, generation_dir / "ease_curve" / "video.mp4")
            self.assertIn(generation_dir, resolved.parents)

            with self.assertRaises(ValueError):
                generation_media.resolve_generation_path(project_dir, "../project.json")
            with self.assertRaises(ValueError):
                generation_media.resolve_generation_path(project_dir, r"ease_curve\video.mp4")
            with self.assertRaises(ValueError):
                generation_media.resolve_generation_path(project_dir, "ease_curve/../../project.json")

    def test_save_ease_curve_file_and_cleanup_same_node_only(self):
        with self._temporary_project() as project_dir:
            project_path = Path(project_dir)

            first = generation_media.save_ease_curve_generation_file(
                project_dir,
                "curve:1/unsafe",
                "run-1",
                "first.mp4",
                b"first-video",
                "video/mp4",
            )
            first_path = project_path / first["path"]
            self.assertEqual(first["path"], "generation/ease_curve/ease_curve_curve_1_unsafe_run-1.mp4")
            self.assertEqual(first["url"], "/api/generation/ease_curve/ease_curve_curve_1_unsafe_run-1.mp4")
            self.assertEqual(first_path.read_bytes(), b"first-video")

            other = generation_media.save_ease_curve_generation_file(
                project_dir,
                "curve-2",
                "run-1",
                "other.webm",
                b"other-video",
                "video/webm",
            )
            other_path = project_path / other["path"]
            self.assertTrue(other_path.exists())

            second = generation_media.save_ease_curve_generation_file(
                project_dir,
                "curve:1/unsafe",
                "run-2",
                "second.mp4",
                b"second-video",
                "video/mp4",
            )
            second_path = project_path / second["path"]

            self.assertFalse(first_path.exists(), "old output for the same node should be removed")
            self.assertEqual(second_path.read_bytes(), b"second-video")
            self.assertTrue(other_path.exists(), "outputs from other nodes should not be removed")

    def test_guess_generation_content_type_for_video(self):
        self.assertEqual(generation_media.guess_generation_content_type("x.mp4"), "video/mp4")
        self.assertEqual(generation_media.guess_generation_content_type("x.webm"), "video/webm")


if __name__ == "__main__":
    unittest.main()
