import asyncio
import os
import shutil
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from llm.providers.base import LLMProviderError
from llm.providers.deepseek_provider import DeepSeekLLMProvider
from llm.schemas import LLMGenerateRequest
from llm.service import LLMService
from llm.skills import loader


def run(coro):
    return asyncio.run(coro)


class FakeProvider:
    def __init__(self, text="ok"):
        self.text = text
        self.requests = []

    async def generate(self, request):
        self.requests.append(request)
        return self.text


def write_skill(base_dir: Path, skill_id: str, body: str = "# Test Skill\n\nDo the thing.") -> Path:
    skill_dir = base_dir / skill_id
    skill_dir.mkdir(parents=True, exist_ok=True)
    (skill_dir / "SKILL.md").write_text(body, encoding="utf-8")
    return skill_dir


def create_symlink_or_skip(test_case: unittest.TestCase, target: Path, link: Path, target_is_directory: bool) -> None:
    try:
        os.symlink(target, link, target_is_directory=target_is_directory)
    except (OSError, NotImplementedError) as exc:
        test_case.skipTest(f"Symlink creation is not available: {exc}")


def make_test_dir(name: str) -> Path:
    path = Path(__file__).parent / ".tmp_soft_skills_runtime" / f"{name}-{uuid.uuid4().hex}"
    path.mkdir(parents=True)
    return path


def remove_test_dir(path: Path) -> None:
    shutil.rmtree(path, ignore_errors=True)
    try:
        path.parent.rmdir()
    except OSError:
        pass


class SoftSkillsLoaderTest(unittest.TestCase):
    def setUp(self):
        self.root = make_test_dir("loader")
        self.global_skills = self.root / "repo" / "skills"
        self.project = self.root / "project"
        self.project_skills = self.project / ".node-canvas" / "skills"
        self.global_skills.mkdir(parents=True)
        self.project_skills.mkdir(parents=True)
        self.global_patch = patch.object(loader, "GLOBAL_SKILLS_DIR", self.global_skills)
        self.global_patch.start()

    def tearDown(self):
        self.global_patch.stop()
        remove_test_dir(self.root)

    def test_scans_global_skills(self):
        write_skill(self.global_skills, "prompt-refiner", "# Prompt Refiner\n\nRewrite rough prompts.")

        skills = loader.scan_soft_skills()

        self.assertEqual([skill.id for skill in skills], ["prompt-refiner"])
        self.assertEqual(skills[0].name, "Prompt Refiner")
        self.assertEqual(skills[0].description, "Rewrite rough prompts.")
        self.assertEqual(skills[0].source, "global")

    def test_scans_project_skills(self):
        write_skill(self.project_skills, "orange-cat-style", "# Orange Cat Style\n\nRules for orange cats.")

        skills = loader.scan_soft_skills(str(self.project))

        self.assertEqual([skill.id for skill in skills], ["orange-cat-style"])
        self.assertEqual(skills[0].source, "project")

    def test_project_skill_overrides_global_same_id(self):
        write_skill(self.global_skills, "prompt-refiner", "# Global Skill\n\nGlobal instructions.")
        write_skill(self.project_skills, "prompt-refiner", "# Project Skill\n\nProject instructions.")

        skills = loader.scan_soft_skills(str(self.project))

        self.assertEqual(len(skills), 1)
        self.assertEqual(skills[0].name, "Project Skill")
        self.assertEqual(skills[0].source, "project")
        self.assertIn("Project instructions", skills[0].instructions)

    def test_skips_missing_empty_and_invalid_skills(self):
        (self.global_skills / "missing-skill-md").mkdir()
        write_skill(self.global_skills, "empty-skill", " \n\n ")
        write_skill(self.global_skills, "Bad Skill", "# Bad\n\nNope.")
        write_skill(self.global_skills, "valid_skill", "No heading.\n\nDescription.")

        with self.assertLogs("llm.skills.loader", level="WARNING") as logs:
            skills = loader.scan_soft_skills()

        self.assertEqual([skill.id for skill in skills], ["valid_skill"])
        self.assertTrue(any("invalid id" in line for line in logs.output))

    def test_skips_unreadable_skill_without_breaking_scan(self):
        write_skill(self.global_skills, "valid-skill", "# Valid Skill\n\nStill works.")
        bad_skill = self.global_skills / "bad-skill"
        bad_skill.mkdir()
        (bad_skill / "SKILL.md").write_bytes(b"\xff\xfe\x00\x80")

        with self.assertLogs("llm.skills.loader", level="WARNING") as logs:
            skills = loader.scan_soft_skills()

        self.assertEqual([skill.id for skill in skills], ["valid-skill"])
        self.assertTrue(any("unreadable local skill" in line for line in logs.output))

    def test_skips_symlink_skill_directory(self):
        target = self.root / "external-skill"
        write_skill(target.parent, "external-skill", "# External\n\nNope.")
        create_symlink_or_skip(self, target, self.global_skills / "linked-skill", True)
        write_skill(self.global_skills, "valid-skill", "# Valid Skill\n\nStill works.")

        skills = loader.scan_soft_skills()

        self.assertEqual([skill.id for skill in skills], ["valid-skill"])

    def test_skips_symlink_skill_file(self):
        target_file = self.root / "external.md"
        target_file.write_text("# External\n\nNope.", encoding="utf-8")
        skill_dir = self.global_skills / "linked-file"
        skill_dir.mkdir()
        create_symlink_or_skip(self, target_file, skill_dir / "SKILL.md", False)
        write_skill(self.global_skills, "valid-skill", "# Valid Skill\n\nStill works.")

        skills = loader.scan_soft_skills()

        self.assertEqual([skill.id for skill in skills], ["valid-skill"])

    def test_get_enabled_instructions_uses_sorted_order(self):
        write_skill(self.global_skills, "first", "# First\n\nOne.")
        write_skill(self.global_skills, "second", "# Second\n\nTwo.")

        instructions = loader.get_enabled_skill_instructions(["second", "first"])

        self.assertLess(instructions.index('<skill id="first">'), instructions.index('<skill id="second">'))
        self.assertIn("Enabled Local Skills:", instructions)

    def test_get_enabled_instructions_deduplicates_skills(self):
        write_skill(self.global_skills, "beta", "# Beta\n\nBeta skill.")
        write_skill(self.global_skills, "alpha", "# Alpha\n\nAlpha skill.")

        instructions = loader.get_enabled_skill_instructions(["beta", "alpha", "beta"])

        self.assertEqual(instructions.count('<skill id="alpha">'), 1)
        self.assertEqual(instructions.count('<skill id="beta">'), 1)
        self.assertLess(instructions.index('<skill id="alpha">'), instructions.index('<skill id="beta">'))

    def test_get_enabled_instructions_errors_for_missing_id(self):
        with self.assertRaisesRegex(LLMProviderError, "Enabled local skill not found: missing"):
            loader.get_enabled_skill_instructions(["missing"])

    def test_get_enabled_instructions_errors_for_unreadable_skill(self):
        bad_skill = self.global_skills / "bad-skill"
        bad_skill.mkdir()
        (bad_skill / "SKILL.md").write_bytes(b"\xff\xfe\x00\x80")

        with self.assertRaisesRegex(LLMProviderError, "Enabled local skill not found: bad-skill"):
            loader.get_enabled_skill_instructions(["bad-skill"])


class SoftSkillsApiTest(unittest.TestCase):
    def test_api_does_not_return_instructions_or_path(self):
        root = make_test_dir("api")
        try:
            global_skills = root / "skills"
            global_skills.mkdir()
            write_skill(global_skills, "prompt-refiner", "# Prompt Refiner\n\nRewrite prompts.")

            with patch.object(loader, "GLOBAL_SKILLS_DIR", global_skills):
                from main import app

                response = TestClient(app).get("/api/llm/skills")
        finally:
            remove_test_dir(root)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [{
            "id": "prompt-refiner",
            "name": "Prompt Refiner",
            "description": "Rewrite prompts.",
            "source": "global",
            "type": "soft",
        }])
        self.assertNotIn("instructions", response.text)
        self.assertNotIn("path", response.text)

    def test_api_skips_bad_skill_and_returns_valid_skills(self):
        root = make_test_dir("api-bad")
        try:
            global_skills = root / "skills"
            global_skills.mkdir()
            write_skill(global_skills, "valid-skill", "# Valid Skill\n\nVisible.")
            bad_skill = global_skills / "bad-skill"
            bad_skill.mkdir()
            (bad_skill / "SKILL.md").write_bytes(b"\xff\xfe\x00\x80")

            with patch.object(loader, "GLOBAL_SKILLS_DIR", global_skills):
                from main import app

                response = TestClient(app).get("/api/llm/skills")
        finally:
            remove_test_dir(root)

        self.assertEqual(response.status_code, 200)
        self.assertEqual([skill["id"] for skill in response.json()], ["valid-skill"])


class SoftSkillsServiceTest(unittest.TestCase):
    def setUp(self):
        self.root = make_test_dir("service")
        self.global_skills = self.root / "skills"
        self.global_skills.mkdir()
        write_skill(self.global_skills, "prompt-refiner", "# Prompt Refiner\n\nRewrite prompts.")
        write_skill(self.global_skills, "cinematic", "# Cinematic\n\nUse cinematic language.")
        self.global_patch = patch.object(loader, "GLOBAL_SKILLS_DIR", self.global_skills)
        self.global_patch.start()

    def tearDown(self):
        self.global_patch.stop()
        remove_test_dir(self.root)

    def test_deepseek_enabled_skills_are_injected_into_system_prompt(self):
        service = LLMService()
        provider = FakeProvider()
        service.providers["deepseek"] = provider

        run(service.generate(LLMGenerateRequest(
            provider="deepseek",
            model="deepseek-v4-flash",
            inputText="hello",
            systemPrompt="Base system.",
            enabledSkills=["prompt-refiner"],
        )))

        system_prompt = provider.requests[0].systemPrompt
        self.assertTrue(system_prompt.startswith("Base system."))
        self.assertIn("Enabled Local Skills:", system_prompt)
        self.assertIn('<skill id="prompt-refiner">', system_prompt)
        self.assertIn("Rewrite prompts.", system_prompt)

    def test_google_with_enabled_skills_is_rejected_without_calling_provider(self):
        service = LLMService()
        provider = FakeProvider()
        service.providers["google"] = provider

        with self.assertRaisesRegex(LLMProviderError, "only for DeepSeek Official models"):
            run(service.generate(LLMGenerateRequest(
                provider="google",
                model="gemini-3.1-flash-lite",
                inputText="hello",
                enabledSkills=["prompt-refiner"],
            )))

        self.assertEqual(provider.requests, [])

    def test_yunwu_with_enabled_skills_is_rejected_without_calling_provider(self):
        service = LLMService()
        provider = FakeProvider()
        service.providers["yunwu"] = provider

        with self.assertRaisesRegex(LLMProviderError, "only for DeepSeek Official models"):
            run(service.generate(LLMGenerateRequest(
                provider="Yunwu",
                model="gemini-3.1-flash-lite",
                inputText="hello",
                enabledSkills=["prompt-refiner"],
            )))

        self.assertEqual(provider.requests, [])

    def test_google_and_yunwu_without_enabled_skills_are_unchanged(self):
        service = LLMService()
        google = FakeProvider("google ok")
        yunwu = FakeProvider("yunwu ok")
        service.providers["google"] = google
        service.providers["yunwu"] = yunwu
        google_request = LLMGenerateRequest(
            provider="google",
            model="gemini-3.1-flash-lite",
            inputText="hello",
        )
        yunwu_request = LLMGenerateRequest(
            provider="Yunwu",
            model="gemini-3.1-flash-lite",
            inputText="hello",
        )

        self.assertEqual(run(service.generate(google_request)), "google ok")
        self.assertEqual(run(service.generate(yunwu_request)), "yunwu ok")

        self.assertIs(google.requests[0], google_request)
        self.assertIs(yunwu.requests[0], yunwu_request)

    def test_deepseek_payload_does_not_include_tools(self):
        service = LLMService(deepseek_api_key="test-key")
        provider = FakeProvider()
        service.providers["deepseek"] = provider

        run(service.generate(LLMGenerateRequest(
            provider="deepseek",
            model="deepseek-v4-flash",
            inputText="hello",
            enabledSkills=["prompt-refiner"],
        )))

        request = provider.requests[0]
        payload = DeepSeekLLMProvider(api_key="test-key").build_payload(request)
        self.assertNotIn("tools", payload)
        self.assertNotIn("tool_choice", payload)
        self.assertEqual(payload["messages"][0]["role"], "system")
        self.assertEqual(len(provider.requests), 1)


if __name__ == "__main__":
    unittest.main()
