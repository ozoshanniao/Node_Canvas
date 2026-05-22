import asyncio
import json
import os
from pathlib import Path
from typing import Any

from video_generation.schemas import VideoTask


_LOCKS: dict[str, asyncio.Lock] = {}


def _project_key(project_path: str) -> str:
    return str(Path(project_path).resolve())


def _project_lock(project_path: str) -> asyncio.Lock:
    key = _project_key(project_path)
    if key not in _LOCKS:
        _LOCKS[key] = asyncio.Lock()
    return _LOCKS[key]


def ensure_tasks_dir(project_path: str) -> str:
    tasks_dir = os.path.join(project_path, "tasks")
    os.makedirs(tasks_dir, exist_ok=True)
    return tasks_dir


def _tasks_file(project_path: str) -> str:
    return os.path.join(ensure_tasks_dir(project_path), "video_tasks.json")


def _read_tasks(project_path: str) -> dict[str, Any]:
    path = _tasks_file(project_path)
    if not os.path.exists(path):
        _write_tasks(project_path, {})
        return {}
    with open(path, "r", encoding="utf-8") as file:
        try:
            data = json.load(file)
        except json.JSONDecodeError:
            return {}
    return data if isinstance(data, dict) else {}


def _write_tasks(project_path: str, tasks: dict[str, Any]) -> None:
    path = _tasks_file(project_path)
    tmp_path = f"{path}.tmp"
    with open(tmp_path, "w", encoding="utf-8") as file:
        json.dump(tasks, file, indent=2, ensure_ascii=False)
    os.replace(tmp_path, path)


async def load_tasks(project_path: str) -> dict[str, Any]:
    async with _project_lock(project_path):
        return _read_tasks(project_path)


async def save_tasks(project_path: str, tasks: dict[str, Any]) -> None:
    async with _project_lock(project_path):
        _write_tasks(project_path, tasks)


async def get_task(project_path: str, task_id: str) -> VideoTask | None:
    async with _project_lock(project_path):
        task = _read_tasks(project_path).get(task_id)
    return VideoTask(**task) if task else None


async def upsert_task(project_path: str, task: VideoTask) -> VideoTask:
    async with _project_lock(project_path):
        tasks = _read_tasks(project_path)
        tasks[task.id] = task.model_dump()
        _write_tasks(project_path, tasks)
    return task


async def update_task(project_path: str, task_id: str, patch: dict[str, Any]) -> VideoTask | None:
    async with _project_lock(project_path):
        tasks = _read_tasks(project_path)
        task = tasks.get(task_id)
        if not task:
            return None
        task.update(patch)
        tasks[task_id] = task
        _write_tasks(project_path, tasks)
    return VideoTask(**task)
