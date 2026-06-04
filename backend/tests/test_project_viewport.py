import json
import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

import main


TEST_TMP_ROOT = Path("C:/tmp/Node-AI-Canvas-tests")
TEST_TMP_ROOT.mkdir(exist_ok=True)


class ProjectViewportPersistenceTest(unittest.TestCase):
    def test_project_save_writes_viewport(self):
        client = TestClient(main.app)

        with tempfile.TemporaryDirectory(dir=TEST_TMP_ROOT) as tmpdir:
            project_path = Path(tmpdir)
            response = client.post(
                "/api/project/save",
                json={
                    "path": str(project_path),
                    "projectName": "Viewport Project",
                    "nodes": [],
                    "edges": [],
                    "groups": {},
                    "viewport": {"x": -240, "y": 120.5, "zoom": 0.8},
                },
            )

            self.assertEqual(response.status_code, 200)
            saved = json.loads((project_path / "project.json").read_text(encoding="utf-8"))
            self.assertEqual(saved["viewport"], {"x": -240, "y": 120.5, "zoom": 0.8})
            self.assertEqual(saved["nodes"], [])
            self.assertEqual(saved["edges"], [])
            self.assertEqual(saved["groups"], {})

    def test_project_init_loads_legacy_project_without_viewport(self):
        client = TestClient(main.app)

        with tempfile.TemporaryDirectory(dir=TEST_TMP_ROOT) as tmpdir:
            project_path = Path(tmpdir)
            legacy_project = {
                "projectName": "Legacy Project",
                "nodes": [],
                "edges": [],
                "groups": {},
            }
            (project_path / "project.json").write_text(
                json.dumps(legacy_project),
                encoding="utf-8",
            )

            response = client.post("/api/project/init", json={"path": str(project_path)})

            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["status"], "success")
            self.assertEqual(response.json()["data"], legacy_project)


if __name__ == "__main__":
    unittest.main()
