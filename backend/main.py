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
from engines.specs import get_frontend_specs # 🌟 引入能力大池子

load_dotenv()
from engines.google_engine import GoogleEngine
from engines.yunwu_engine import YunwuEngine


# 实例化引擎，以后要换成中转商，只需在这里换个类名
engines = {
    "Google": GoogleEngine(api_key=os.getenv("GOOGLE_CLOUD_API_KEY")),
    "Yunwu": YunwuEngine(api_key=os.getenv("YUNWU_API_KEY")) 
}

# --- 1. 数据模型与全局配置 ---
class Position(BaseModel):
    x: float
    y: float

class NodeData(BaseModel):
    model_config = ConfigDict(extra='ignore') # 🌟 核心补丁：忽略前端多传的无关字段

    id: str
    type: str
    position: Optional[Position] = None  # 🌟 核心：必须在这里添加 position 字段
    width: Optional[float] = None        # 🌟 必须有宽度字段
    height: Optional[float] = None       # 🌟 必须有高度字段
    data: Dict[str, Any]

class EdgeData(BaseModel):
    model_config = ConfigDict(extra='ignore') # 🌟 同样给连线模型也加上

    id: str
    source: str
    target: str
    sourceHandle: Optional[str] = None
    targetHandle: Optional[str] = None

class WorkflowPayload(BaseModel):
    triggerId: str
    nodes: List[NodeData]
    edges: List[EdgeData]
    projectPath: Optional[str] = None # 🌟 允许为空，并在逻辑中校验，防止 422

class ProjectConfig(BaseModel):
    path: str
    nodes: Optional[List[NodeData]] = []
    edges: Optional[List[EdgeData]] = []

# 全局变量锁定当前项目，用于动态图片读取
CURRENT_PROJECT_PATH = None

# --- 2. 初始化 Gemini 客户端 ---
client = genai.Client(
    vertexai=True,
    api_key=os.getenv("GOOGLE_CLOUD_API_KEY")
)

# --- 3. 核心功能函数 ---

# --- 4. FastAPI 路由 ---
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5174"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 🌟 项目初始化：创建文件夹和 project.json
@app.post("/api/project/init")
async def init_project(config: ProjectConfig):
    global CURRENT_PROJECT_PATH
    try:
        abs_path = os.path.abspath(config.path)
        os.makedirs(abs_path, exist_ok=True)
        
        # 创建图片存放子目录
        gen_dir = os.path.join(abs_path, "generation")
        os.makedirs(gen_dir, exist_ok=True)
        
        # 创建/读取 project.json
        project_file = os.path.join(abs_path, "project.json")
        existing_data = {"nodes": [], "edges": []}
        
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
    🌟 前端启动时会调用此接口，
    根据返回的字典动态生成 ImageNode 的下拉菜单和滑块。
    """
    return get_frontend_specs()

# 🌟 自动保存接口
@app.post("/api/project/save")
async def save_project(config: ProjectConfig):
    if not config.path: return
    project_file = os.path.join(config.path, "project.json")
    # 将模型转换为字典保存
    data = {
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
    root.update() # 强制刷新，确保窗口能跳出来
    
    # 🌟 关键修改：从 askdirectory 改为 askopenfilename
    # 这样才会显示文件，并且我们设置了只看 .json
    file_path = filedialog.askopenfilename(
        title="oZo | Select Project JSON",
        filetypes=[("JSON files", "*.json")] 
    )
    root.destroy()

    if not file_path:
        return {"projectPath": None, "content": None}

    # 自动获取该 JSON 所在的文件夹路径
    project_dir = os.path.dirname(file_path)

    # 🌟 关键：同步全局变量，否则后续图片无法显示
    global CURRENT_PROJECT_PATH
    CURRENT_PROJECT_PATH = project_dir
    
    # 读取该 JSON 的内容直接传给前端
    with open(file_path, "r", encoding="utf-8") as f:
        content = json.load(f)

    return {"projectPath": project_dir, "content": content}

# 🌟 动态图片代理：读取项目路径下的生成图片
@app.get("/api/image/{filename}")
async def get_image(filename: str, projectPath: Optional[str] = None):
    base_path = projectPath or CURRENT_PROJECT_PATH
    if not base_path:
        raise HTTPException(status_code=400, detail="Project path not identified")
    
    img_path = os.path.join(base_path, "generation", filename)
    
    if os.path.exists(img_path):
        # 🌟 修正：根据后缀动态判断 MIME 类型，确保浏览器渲染
        content_type = "image/jpeg" if filename.endswith((".jpg", ".jpeg")) else "image/png"
        return FileResponse(img_path, media_type=content_type)
        
    raise HTTPException(status_code=404)

@app.post("/run-workflow")
async def run_workflow(payload: WorkflowPayload):
    node_map = {node.id: node for node in payload.nodes}
    trigger_node = node_map.get(payload.triggerId)

    # 🌟 动态选择引擎：根据 UI 下拉菜单选中的 provider 决定
    provider = trigger_node.data.get("provider", "Google")
    active_engine = engines.get(provider)
    
    if not active_engine:
        return {"status": "error", "message": f"Engine {provider} not found"}

    # 1. 组装配置 (从节点获取参数)
# 🌟 优化：直接透传整个 data 域作为 config
    # 这样以后你在 specs.py 里增加 'n' 或 'quality'，后端引擎能直接拿到，无需改动 main.py
    config = trigger_node.data
    
    # 2. 溯源 Prompt
    prompt = ""
    for edge in payload.edges:
        if edge.target == payload.triggerId and edge.targetHandle == "text:prompt":
            upstream = node_map.get(edge.source)
            if upstream:
                prompt = upstream.data.get("text", "")

# 3. 🌟 调用解耦后的引擎生成图片
    # 路径转换：将路径指向项目文件夹下的 generation 子目录
    gen_dir = os.path.join(payload.projectPath, "generation")

    # 🌟 统一提取 images 数组
    image_inputs = trigger_node.data.get("images", [])
    
# 🌟 修改：考虑到以后可能生成多张图，我们将返回值处理得更鲁棒
    result = await active_engine.generate(config, prompt, gen_dir, image_inputs)

    if not result:
        return {"status": "error", "message": "AI Generation failed"}
    if isinstance(result, list):
        full_urls = [f"http://127.0.0.1:8000{url}" for url in result]
        return {"status": "success", "data": {"urls": full_urls}}
    else:
        full_url = f"http://127.0.0.1:8000{result}"
        return {"status": "success", "data": {"url": full_url}}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)