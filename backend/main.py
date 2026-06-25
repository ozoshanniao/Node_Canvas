# backend/main.py
import os
import json
import base64
import uuid
import asyncio
import mimetypes
import re
import tkinter as tk
import base64
from tkinter import filedialog
from typing import List, Dict, Any, Optional
from pathlib import Path
from pydantic import BaseModel, ConfigDict

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from google import genai
from google.genai import types
from dotenv import load_dotenv
from image_generation.schemas import ImageGenerationRequest
from image_generation.service import ImageGenerationService
from llm.providers.base import LLMProviderError
from llm.schemas import LLMGenerateRequest
from llm.service import LLMService
from llm.specs import get_llm_specs as get_llm_model_specs
from llm.skills.loader import public_soft_skills, scan_soft_skills
from video_generation.schemas import VideoGenerateRequest
from video_generation.service import VideoGenerationService
from engines.specs import get_frontend_specs  # Frontend engine capability specs
from generation_media import (
    guess_generation_content_type,
    resolve_generation_path,
    save_ease_curve_generation_file,
)
from settings_router import router as settings_router

load_dotenv()
from engines.google_engine import GoogleEngine
from engines.yunwu_engine import YunwuEngine


# Engine instances
engines = {
    "Google": GoogleEngine(api_key=os.getenv("GOOGLE_CLOUD_API_KEY")),
    "Yunwu": YunwuEngine(),
}

image_generation_service = ImageGenerationService(engines)

llm_service = LLMService(
    google_api_key=os.getenv("GOOGLE_CLOUD_API_KEY"),
    deepseek_base_url=os.getenv("DEEPSEEK_BASE_URL"),
    openai_base_url=os.getenv("OPENAI_BASE_URL"),
)

video_generation_service = VideoGenerationService()

# Data models and global config
class Position(BaseModel):
    x: float
    y: float

class NodeData(BaseModel):
    model_config = ConfigDict(extra='ignore')

    id: str
    type: str
    position: Optional[Position] = None
    width: Optional[float] = None
    height: Optional[float] = None
    groupId: Optional[str] = None
    data: Dict[str, Any]

class EdgeData(BaseModel):
    model_config = ConfigDict(extra='ignore')

    id: str
    source: str
    target: str
    sourceHandle: Optional[str] = None
    targetHandle: Optional[str] = None
    data: Optional[Dict[str, Any]] = None

class WorkflowPayload(BaseModel):
    triggerId: str
    nodes: List[NodeData]
    edges: List[EdgeData]
    imageInputs: Optional[List[Any]] = []
    projectPath: Optional[str] = None

class ProjectConfig(BaseModel):
    path: str
    projectFilePath: Optional[str] = None
    projectName: Optional[str] = None
    nodes: Optional[List[NodeData]] = []
    edges: Optional[List[EdgeData]] = []
    groups: Optional[Dict[str, Any]] = {}
    viewport: Optional[Dict[str, Any]] = None

# Current project path used by media endpoints.
CURRENT_PROJECT_PATH = None

client = genai.Client(
    vertexai=True,
    api_key=os.getenv("GOOGLE_CLOUD_API_KEY")
)

app = FastAPI()
app.include_router(settings_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5174",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://localhost:5173",
    ], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize a project directory and project.json.
@app.post("/api/project/init")
async def init_project(config: ProjectConfig):
    global CURRENT_PROJECT_PATH
    try:
        abs_path = os.path.abspath(config.path)
        os.makedirs(abs_path, exist_ok=True)
        
        # Create generated media directory.
        gen_dir = os.path.join(abs_path, "generation")
        os.makedirs(gen_dir, exist_ok=True)

        # Create input media directory.
        input_dir = os.path.join(abs_path, "input")
        os.makedirs(input_dir, exist_ok=True)
        
        # Create or read project.json.
        project_file = os.path.join(abs_path, "project.json")
        existing_data = {"projectName": os.path.basename(abs_path) or "Untitled Project", "nodes": [], "edges": [], "groups": {}, "viewport": None}
        
        if os.path.exists(project_file):
            with open(project_file, "r", encoding="utf-8") as f:
                existing_data = json.load(f)
        else:
            with open(project_file, "w", encoding="utf-8") as f:
                json.dump(existing_data, f)
        
        CURRENT_PROJECT_PATH = abs_path
        return {"status": "success", "data": existing_data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
@app.get("/api/model-specs")
async def get_specs():
    """
    Return frontend engine capability specs.
    """
    return get_frontend_specs()

@app.get("/api/video/model-specs")
async def get_video_specs():
    return video_generation_service.get_model_specs()

@app.get("/api/video/specs")
async def get_video_specs_alias():
    return video_generation_service.get_model_specs()

@app.post("/api/video/generate")
async def generate_video(payload: VideoGenerateRequest):
    project_path = payload.projectPath or CURRENT_PROJECT_PATH
    if not project_path:
        raise HTTPException(status_code=400, detail="projectPath is required")
    try:
        task = await video_generation_service.create_task(project_path, payload)
        return {"status": "success", "data": task.model_dump()}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/video/tasks/{task_id}")
async def get_video_task(task_id: str, projectPath: Optional[str] = None):
    project_path = projectPath or CURRENT_PROJECT_PATH
    if not project_path:
        raise HTTPException(status_code=400, detail="projectPath is required")
    try:
        task = await video_generation_service.query_task(project_path, task_id)
        return {"status": "success", "data": task.model_dump()}
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/video/{filename}")
async def get_video(filename: str, projectPath: Optional[str] = None):
    base_path = projectPath or CURRENT_PROJECT_PATH
    if not base_path:
        raise HTTPException(status_code=400, detail="Project path not identified")
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    if not filename.lower().endswith(".mp4"):
        raise HTTPException(status_code=400, detail="Invalid video filename")

    video_path = os.path.join(base_path, "generation", "videos", filename)
    if not os.path.exists(video_path):
        raise HTTPException(status_code=404, detail="Video not found")

    response = FileResponse(video_path, media_type="video/mp4")
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Cross-Origin-Resource-Policy"] = "cross-origin"
    return response

@app.get("/api/llm/specs")
async def get_llm_specs():
    return get_llm_model_specs()

@app.post("/api/llm/generate")
async def generate_llm(payload: LLMGenerateRequest):
    try:
        print("[LLM generate]", {
            "provider": payload.provider,
            "model": payload.model,
            "imageInputs": len(payload.imageInputs or []),
            "inputTextLength": len(payload.inputText or ""),
        })
        text = await llm_service.generate(payload)
        return {"status": "success", "success": True, "data": {"text": text, "provider": payload.provider, "model": payload.model}, "text": text, "provider": payload.provider, "model": payload.model}
    except NotImplementedError as e:
        raise HTTPException(status_code=501, detail=str(e))
    except LLMProviderError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/llm/skills")
async def list_llm_skills(projectPath: Optional[str] = None):
    try:
        return [skill.model_dump() for skill in public_soft_skills(scan_soft_skills(projectPath))]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Save project data.
@app.post("/api/project/save")
async def save_project(config: ProjectConfig):
    if not config.path: return
    project_file = config.projectFilePath or os.path.join(config.path, "project.json")
    project_dir = os.path.dirname(project_file) or config.path
    os.makedirs(project_dir, exist_ok=True)
    # Convert models to dictionaries for persistence.
    data = {
        "projectName": config.projectName or Path(project_file).stem or os.path.basename(config.path) or "Untitled Project",
        "nodes": [n.model_dump() for n in config.nodes],
        "edges": [e.model_dump() for e in config.edges],
        "groups": config.groups or {},
        "viewport": config.viewport,
    }
    with open(project_file, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=4, ensure_ascii=False)
    return {"status": "success"}

@app.get("/api/select-folder")
async def select_folder():
    root = tk.Tk()
    root.withdraw()
    root.attributes('-topmost', True)
    path = filedialog.askdirectory(title="oZo | Select Workspace Folder")
    root.destroy()
    return {"path": path if path else None}

@app.get("/api/select-project-file")
async def select_project_file():
    root = tk.Tk()
    root.withdraw()
    root.attributes('-topmost', True)
    root.update()
    
    # Select a project JSON file.
    file_path = filedialog.askopenfilename(
        title="oZo | Select Project JSON",
        filetypes=[("JSON files", "*.json")] 
    )
    root.destroy()

    if not file_path:
        return {"projectPath": None, "content": None}

    # Use the selected JSON file's directory as the project directory.
    project_dir = os.path.dirname(file_path)

    # Keep media endpoints aligned with the loaded project.
    global CURRENT_PROJECT_PATH
    CURRENT_PROJECT_PATH = project_dir
    
    # Return project JSON content to the frontend.
    with open(file_path, "r", encoding="utf-8") as f:
        content = json.load(f)

    return {"projectPath": project_dir, "projectFilePath": file_path, "content": content}

# Serve generated images from the current project.
@app.get("/api/image/{filename}")
async def get_image(filename: str, projectPath: Optional[str] = None):
    base_path = projectPath or CURRENT_PROJECT_PATH
    if not base_path:
        raise HTTPException(status_code=400, detail="Project path not identified")

    img_path = os.path.join(base_path, "generation", filename)

    if os.path.exists(img_path):
        lower_name = filename.lower()
        if lower_name.endswith((".jpg", ".jpeg")):
            content_type = "image/jpeg"
        elif lower_name.endswith(".webp"):
            content_type = "image/webp"
        else:
            content_type = "image/png"
        response = FileResponse(img_path, media_type=content_type)
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Cross-Origin-Resource-Policy"] = "cross-origin"
        return response

    raise HTTPException(status_code=404)


INPUT_MIME_FALLBACKS = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".m4a": "audio/mp4",
    ".aac": "audio/aac",
    ".ogg": "audio/ogg",
    ".opus": "audio/opus",
    ".flac": "audio/flac",
    ".webm": "audio/webm",
    ".mp4": "audio/mp4",
}


def _parse_multipart_header_value(header: str, key: str) -> str:
    match = re.search(rf'{key}="([^"]*)"', header)
    return match.group(1) if match else ""


def _parse_ease_curve_multipart(body: bytes, content_type: str) -> dict[str, Any]:
    boundary_match = re.search(r"boundary=([^;]+)", content_type or "")
    if not boundary_match:
        raise ValueError("multipart boundary is required")

    boundary = boundary_match.group(1).strip().strip('"').encode("utf-8")
    fields: dict[str, Any] = {}
    for part in body.split(b"--" + boundary):
        part = part.strip(b"\r\n")
        if not part or part == b"--":
            continue
        if part.endswith(b"--"):
            part = part[:-2].rstrip(b"\r\n")
        header_bytes, separator, value = part.partition(b"\r\n\r\n")
        if not separator:
            continue
        headers = header_bytes.decode("utf-8", errors="replace")
        disposition = next(
            (line for line in headers.split("\r\n") if line.lower().startswith("content-disposition:")),
            "",
        )
        name = _parse_multipart_header_value(disposition, "name")
        if not name:
            continue
        if name == "file":
            fields["file"] = value[:-2] if value.endswith(b"\r\n") else value
            fields["filename"] = _parse_multipart_header_value(disposition, "filename")
            content_type_header = next(
                (line for line in headers.split("\r\n") if line.lower().startswith("content-type:")),
                "",
            )
            fields["contentType"] = content_type_header.split(":", 1)[1].strip() if ":" in content_type_header else ""
        else:
            text_value = value[:-2] if value.endswith(b"\r\n") else value
            fields[name] = text_value.decode("utf-8", errors="replace")
    return fields


def guess_input_content_type(filename: str) -> str:
    suffix = Path(filename).suffix.lower()
    if suffix in INPUT_MIME_FALLBACKS:
        return INPUT_MIME_FALLBACKS[suffix]
    guessed = mimetypes.guess_type(filename)[0]
    if guessed:
        return guessed
    return "application/octet-stream"


@app.get("/api/generation/{subpath:path}")
async def get_generation_file(subpath: str, projectPath: Optional[str] = None):
    base_path = projectPath or CURRENT_PROJECT_PATH
    try:
        file_path = resolve_generation_path(base_path, subpath)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="Generation file not found")

    response = FileResponse(file_path, media_type=guess_generation_content_type(file_path.name))
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Cross-Origin-Resource-Policy"] = "cross-origin"
    return response


@app.post("/api/generation/ease-curve")
async def save_ease_curve_generation(request: Request):
    try:
        form = _parse_ease_curve_multipart(await request.body(), request.headers.get("content-type", ""))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    projectPath = form.get("projectPath")
    nodeId = form.get("nodeId")
    runRequestId = form.get("runRequestId")
    file_bytes = form.get("file")
    if not projectPath or not nodeId or not runRequestId or not file_bytes:
        raise HTTPException(status_code=400, detail="projectPath, nodeId, runRequestId and file are required")

    try:
        result = save_ease_curve_generation_file(
            projectPath,
            nodeId,
            runRequestId,
            form.get("filename", ""),
            file_bytes,
            form.get("contentType", ""),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save Easy Curve output: {e}")

    return {
        "status": "success",
        "data": result,
    }


# 新增：保存图片/音频到 input 目录
@app.post("/api/input/save")
async def save_input_image(payload: dict):
    """
    Save image or audio to project input directory.

    Accepts:
    - projectPath: str (required)
    - imageData: str (base64 or data URL)
    - sourceKind: str (upload, paste, drop, split, capture, output)
    - filename: str (optional original filename)
    - mimeType: str (optional)

    Returns:
    - url: relative path like "input/xxx.png"
    - width, height, mimeType, bytes
    """
    from image_generation.storage import save_image_bytes_to_input
    from engines.image_utils import decode_base64_payload, infer_mime_type

    project_path = payload.get("projectPath")
    if not project_path:
        raise HTTPException(status_code=400, detail="projectPath is required")

    image_data = payload.get("mediaData") or payload.get("imageData", "")
    if not image_data:
        raise HTTPException(status_code=400, detail="imageData is required")

    source_kind = payload.get("sourceKind", "upload")
    original_filename = payload.get("filename")
    mime_type = payload.get("mimeType")

    # Decode base64 or data URL
    try:
        if image_data.startswith("data:"):
            # Extract mime type from data URL if not provided
            if not mime_type:
                header = image_data.split(",")[0]
                if ":" in header:
                    mime_type = header.split(":")[1].split(";")[0]
            image_bytes = decode_base64_payload(image_data)
        else:
            # Assume raw base64
            image_bytes = decode_base64_payload(image_data)

        if not mime_type:
            mime_type = infer_mime_type(image_bytes)
        if original_filename and (not mime_type or mime_type == "application/octet-stream"):
            mime_type = guess_input_content_type(original_filename)

        result = save_image_bytes_to_input(
            image_bytes=image_bytes,
            project_path=project_path,
            source_kind=source_kind,
            mime_type=mime_type,
            original_filename=original_filename,
        )

        return {"status": "success", "data": result}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save input media: {str(e)}")


# 新增：读取 input 目录媒体
@app.get("/api/input/{filename}")
async def get_input_image(filename: str, projectPath: Optional[str] = None):
    """Read media from project input directory."""
    base_path = projectPath or CURRENT_PROJECT_PATH
    if not base_path:
        raise HTTPException(status_code=400, detail="Project path not identified")

    # Security: prevent path traversal
    if ".." in filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")

    input_path = os.path.join(base_path, "input", filename)

    if os.path.exists(input_path):
        response = FileResponse(input_path, media_type=guess_input_content_type(filename))
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Cross-Origin-Resource-Policy"] = "cross-origin"
        return response

    raise HTTPException(status_code=404, detail="Input media not found")


@app.post("/run-workflow")
async def run_workflow(payload: WorkflowPayload):
    node_map = {node.id: node for node in payload.nodes}
    trigger_node = node_map.get(payload.triggerId)

    provider = trigger_node.data.get("provider", "Google")
    config = trigger_node.data

    prompt = ""
    for edge in payload.edges:
        if edge.target == payload.triggerId and edge.targetHandle == "text:prompt":
            upstream = node_map.get(edge.source)
            if upstream:
                prompt = upstream.data.get("text", "")

    image_inputs = payload.imageInputs or []

    try:
        result = await image_generation_service.generate(
            ImageGenerationRequest(
                provider=provider,
                model=config.get("model"),
                prompt=prompt,
                config=config,
                project_path=payload.projectPath,
                image_inputs=image_inputs,
            )
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if not result:
        return {"status": "error", "message": "AI Generation failed"}
    return {"status": "success", "data": result.to_response_data()}
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
