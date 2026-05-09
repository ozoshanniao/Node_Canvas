# backend/main.py
import os
import json
import base64
import uuid
import asyncio
import tkinter as tk
import base64
from tkinter import filedialog
from typing import List, Dict, Any, Optional
from pathlib import Path
from pydantic import BaseModel, ConfigDict

from fastapi import FastAPI, HTTPException
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
from engines.specs import get_frontend_specs # 馃専 寮曞叆鑳藉姏澶ф睜瀛?

load_dotenv()
from engines.google_engine import GoogleEngine
from engines.yunwu_engine import YunwuEngine


# 瀹炰緥鍖栧紩鎿庯紝浠ュ悗瑕佹崲鎴愪腑杞晢锛屽彧闇€鍦ㄨ繖閲屾崲涓被鍚?
engines = {
    "Google": GoogleEngine(api_key=os.getenv("GOOGLE_CLOUD_API_KEY")),
    "Yunwu": YunwuEngine(api_key=os.getenv("YUNWU_API_KEY")) 
}

image_generation_service = ImageGenerationService(engines)

llm_service = LLMService(
    yunwu_api_key=os.getenv("YUNWU_API_KEY"),
    google_api_key=os.getenv("GOOGLE_CLOUD_API_KEY"),
)

# --- 1. 鏁版嵁妯″瀷涓庡叏灞€閰嶇疆 ---
class Position(BaseModel):
    x: float
    y: float

class NodeData(BaseModel):
    model_config = ConfigDict(extra='ignore') # 馃専 鏍稿績琛ヤ竵锛氬拷鐣ュ墠绔浼犵殑鏃犲叧瀛楁

    id: str
    type: str
    position: Optional[Position] = None  # 馃専 鏍稿績锛氬繀椤诲湪杩欓噷娣诲姞 position 瀛楁
    width: Optional[float] = None        # 馃専 蹇呴』鏈夊搴﹀瓧娈?
    height: Optional[float] = None       # 馃専 蹇呴』鏈夐珮搴﹀瓧娈?
    data: Dict[str, Any]

class EdgeData(BaseModel):
    model_config = ConfigDict(extra='ignore') # 馃専 鍚屾牱缁欒繛绾挎ā鍨嬩篃鍔犱笂

    id: str
    source: str
    target: str
    sourceHandle: Optional[str] = None
    targetHandle: Optional[str] = None

class WorkflowPayload(BaseModel):
    triggerId: str
    nodes: List[NodeData]
    edges: List[EdgeData]
    imageInputs: Optional[List[Any]] = []
    projectPath: Optional[str] = None # 馃専 鍏佽涓虹┖锛屽苟鍦ㄩ€昏緫涓牎楠岋紝闃叉 422

class ProjectConfig(BaseModel):
    path: str
    projectFilePath: Optional[str] = None
    projectName: Optional[str] = None
    nodes: Optional[List[NodeData]] = []
    edges: Optional[List[EdgeData]] = []

# 鍏ㄥ眬鍙橀噺閿佸畾褰撳墠椤圭洰锛岀敤浜庡姩鎬佸浘鐗囪鍙?
CURRENT_PROJECT_PATH = None

# --- 2. 鍒濆鍖?Gemini 瀹㈡埛绔?---
client = genai.Client(
    vertexai=True,
    api_key=os.getenv("GOOGLE_CLOUD_API_KEY")
)

# --- 3. 鏍稿績鍔熻兘鍑芥暟 ---

# --- 4. FastAPI 璺敱 ---
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5174"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 馃専 椤圭洰鍒濆鍖栵細鍒涘缓鏂囦欢澶瑰拰 project.json
@app.post("/api/project/init")
async def init_project(config: ProjectConfig):
    global CURRENT_PROJECT_PATH
    try:
        abs_path = os.path.abspath(config.path)
        os.makedirs(abs_path, exist_ok=True)
        
        # 鍒涘缓鍥剧墖瀛樻斁瀛愮洰褰?
        gen_dir = os.path.join(abs_path, "generation")
        os.makedirs(gen_dir, exist_ok=True)
        
        # 鍒涘缓/璇诲彇 project.json
        project_file = os.path.join(abs_path, "project.json")
        existing_data = {"projectName": os.path.basename(abs_path) or "Untitled Project", "nodes": [], "edges": []}
        
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
    馃専 鍓嶇鍚姩鏃朵細璋冪敤姝ゆ帴鍙ｏ紝
    鏍规嵁杩斿洖鐨勫瓧鍏稿姩鎬佺敓鎴?ImageNode 鐨勪笅鎷夎彍鍗曞拰婊戝潡銆?
    """
    return get_frontend_specs()

@app.post("/api/llm/generate")
async def generate_llm(payload: LLMGenerateRequest):
    try:
        text = await llm_service.generate(payload)
        return {"status": "success", "data": {"text": text}}
    except NotImplementedError as e:
        raise HTTPException(status_code=501, detail=str(e))
    except LLMProviderError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# 馃専 鑷姩淇濆瓨鎺ュ彛
@app.post("/api/project/save")
async def save_project(config: ProjectConfig):
    if not config.path: return
    project_file = config.projectFilePath or os.path.join(config.path, "project.json")
    project_dir = os.path.dirname(project_file) or config.path
    os.makedirs(project_dir, exist_ok=True)
    # 灏嗘ā鍨嬭浆鎹负瀛楀吀淇濆瓨
    data = {
        "projectName": config.projectName or Path(project_file).stem or os.path.basename(config.path) or "Untitled Project",
        "nodes": [n.model_dump() for n in config.nodes],
        "edges": [e.model_dump() for e in config.edges]
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
    root.update() # 寮哄埗鍒锋柊锛岀‘淇濈獥鍙ｈ兘璺冲嚭鏉?
    
    # 馃専 鍏抽敭淇敼锛氫粠 askdirectory 鏀逛负 askopenfilename
    # 杩欐牱鎵嶄細鏄剧ず鏂囦欢锛屽苟涓旀垜浠缃簡鍙湅 .json
    file_path = filedialog.askopenfilename(
        title="oZo | Select Project JSON",
        filetypes=[("JSON files", "*.json")] 
    )
    root.destroy()

    if not file_path:
        return {"projectPath": None, "content": None}

    # 鑷姩鑾峰彇璇?JSON 鎵€鍦ㄧ殑鏂囦欢澶硅矾寰?
    project_dir = os.path.dirname(file_path)

    # 馃専 鍏抽敭锛氬悓姝ュ叏灞€鍙橀噺锛屽惁鍒欏悗缁浘鐗囨棤娉曟樉绀?
    global CURRENT_PROJECT_PATH
    CURRENT_PROJECT_PATH = project_dir
    
    # 璇诲彇璇?JSON 鐨勫唴瀹圭洿鎺ヤ紶缁欏墠绔?
    with open(file_path, "r", encoding="utf-8") as f:
        content = json.load(f)

    return {"projectPath": project_dir, "projectFilePath": file_path, "content": content}

# 馃専 鍔ㄦ€佸浘鐗囦唬鐞嗭細璇诲彇椤圭洰璺緞涓嬬殑鐢熸垚鍥剧墖
@app.get("/api/image/{filename}")
async def get_image(filename: str, projectPath: Optional[str] = None):
    base_path = projectPath or CURRENT_PROJECT_PATH
    if not base_path:
        raise HTTPException(status_code=400, detail="Project path not identified")
    
    img_path = os.path.join(base_path, "generation", filename)
    
    if os.path.exists(img_path):
        # 馃専 淇锛氭牴鎹悗缂€鍔ㄦ€佸垽鏂?MIME 绫诲瀷锛岀‘淇濇祻瑙堝櫒娓叉煋
        lower_name = filename.lower()
        if lower_name.endswith((".jpg", ".jpeg")):
            content_type = "image/jpeg"
        elif lower_name.endswith(".webp"):
            content_type = "image/webp"
        else:
            content_type = "image/png"
        return FileResponse(img_path, media_type=content_type)
        
    raise HTTPException(status_code=404)

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

    if not result:
        return {"status": "error", "message": "AI Generation failed"}
    return {"status": "success", "data": result.to_response_data()}
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
