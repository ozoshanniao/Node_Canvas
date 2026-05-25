import logging
import re
from pathlib import Path
from typing import Iterable

from llm.providers.base import LLMProviderError
from llm.skills.schemas import SoftSkill, SoftSkillPublic


REPO_ROOT = Path(__file__).resolve().parents[3]
GLOBAL_SKILLS_DIR = REPO_ROOT / "skills"
SKILL_ID_RE = re.compile(r"^[a-z0-9_-]+$")
MAX_SKILL_CHARS = 20_000
LOGGER = logging.getLogger(__name__)


def _skill_name_from_id(skill_id: str) -> str:
    return " ".join(part.capitalize() for part in re.split(r"[-_]+", skill_id) if part) or skill_id


def _parse_skill_metadata(skill_id: str, instructions: str) -> tuple[str, str]:
    lines = [line.rstrip() for line in instructions.splitlines()]
    name = ""
    description = ""
    h1_index = -1
    for index, line in enumerate(lines):
        stripped = line.strip()
        if stripped.startswith("# "):
            name = stripped[2:].strip()
            h1_index = index
            break

    for line in lines[h1_index + 1 if h1_index >= 0 else 0:]:
        stripped = line.strip()
        if stripped and not stripped.startswith("#"):
            description = stripped[:200]
            break

    return name or _skill_name_from_id(skill_id), description


def _read_skill(skill_dir: Path, source: str) -> SoftSkill | None:
    skill_id = skill_dir.name
    if not SKILL_ID_RE.fullmatch(skill_id):
        LOGGER.warning("Skipping local skill with invalid id: %s (%s)", skill_id, source)
        return None
    if skill_dir.is_symlink() or not skill_dir.is_dir():
        return None

    skill_file = skill_dir / "SKILL.md"
    if skill_file.is_symlink() or not skill_file.is_file():
        return None

    try:
        resolved_skill_dir = skill_dir.resolve()
        resolved_skill_file = skill_file.resolve()
        resolved_skill_file.relative_to(resolved_skill_dir)
    except (OSError, ValueError):
        LOGGER.warning("Skipping local skill outside its skill directory: %s (%s)", skill_id, source)
        return None

    try:
        instructions = skill_file.read_text(encoding="utf-8")[:MAX_SKILL_CHARS].strip()
    except (OSError, UnicodeDecodeError) as exc:
        LOGGER.warning("Skipping unreadable local skill: %s (%s): %s", skill_id, source, exc)
        return None
    if not instructions:
        return None

    name, description = _parse_skill_metadata(skill_id, instructions)
    return SoftSkill(
        id=skill_id,
        name=name,
        description=description,
        source=source,  # type: ignore[arg-type]
        path=str(skill_file),
        instructions=instructions,
    )


def _scan_dir(skills_dir: Path, source: str) -> list[SoftSkill]:
    if skills_dir.is_symlink() or not skills_dir.is_dir():
        return []
    skills = []
    for child in sorted(skills_dir.iterdir(), key=lambda item: item.name):
        skill = _read_skill(child, source)
        if skill:
            skills.append(skill)
    return skills


def _project_skills_dir(project_path: str | None) -> Path | None:
    if not project_path:
        return None
    try:
        resolved_project_path = Path(project_path).expanduser().resolve()
    except OSError:
        LOGGER.warning("Skipping project skills for invalid project path")
        return None
    if resolved_project_path.is_symlink():
        LOGGER.warning("Skipping project skills for symlink project path")
        return None
    return resolved_project_path / ".node-canvas" / "skills"


def scan_soft_skills(project_path: str | None = None) -> list[SoftSkill]:
    merged: dict[str, SoftSkill] = {}
    for skill in _scan_dir(GLOBAL_SKILLS_DIR, "global"):
        merged[skill.id] = skill

    project_dir = _project_skills_dir(project_path)
    if project_dir:
        for skill in _scan_dir(project_dir, "project"):
            merged[skill.id] = skill

    return list(merged.values())


def public_soft_skills(skills: Iterable[SoftSkill]) -> list[SoftSkillPublic]:
    return [SoftSkillPublic(**skill.model_dump()) for skill in skills]


def get_enabled_skill_instructions(enabled_skill_ids: list[str] | None, project_path: str | None = None) -> str:
    skill_ids = [skill_id for skill_id in (enabled_skill_ids or []) if skill_id]
    if not skill_ids:
        return ""

    skills = {skill.id: skill for skill in scan_soft_skills(project_path)}
    sections = []
    for skill_id in skill_ids:
        skill = skills.get(skill_id)
        if not skill:
            raise LLMProviderError(f"Enabled local skill not found: {skill_id}")
        sections.append(f'<skill id="{skill.id}">\n{skill.instructions}\n</skill>')

    return "Enabled Local Skills:\n" + "\n\n".join(sections)
