<p align="center">
  <strong>简体中文</strong> · <a href="./README.md">English</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React" />
  <img src="https://img.shields.io/badge/React_Flow-FF0072?style=for-the-badge&logo=react&logoColor=white" alt="React Flow" />
  <img src="https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white" alt="FastAPI" />
  <img src="https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge" alt="MIT License" />
</p>

# Node-AI-Canvas

## Hero Introduction

Node-AI-Canvas 是一个面向创意工作流的多模态 AI 节点画布，用于将文本、图像、视频、图像标注、空间预览与动效控制连接成可视化生成流程。它提供了直观的视觉界面，将各种 AI 模型与服务相互连接，使用户能够无缝地设计原型、实验并运行复杂的生成式工作流。

## Feature Highlights

### Canvas Workflow
拖拽、放置并连接节点以定义自定义管道。支持在本地保存和加载项目。

### Text & LLM
高级大语言模型节点，用于处理语言任务，具备灵活的配置、提示词增强功能，并官方支持 DeepSeek。

### Image & Annotation
用于图像输入、生成和标注的节点。

### Video Generation
支持视频生成，包含文生视频、图生视频以及多帧工作流（首帧、尾帧）。

### Spatial & Motion
空间预览与动效控制，具备 AR720、Panorama360 和 EaseCurve 等专用节点。

### Settings & Security
通过用户设置和环境变量安全地管理服务提供商 API 密钥，基于严格的安全模型提供保护。

## Screenshots / Demo Placeholder

> 截图 / 演示 GIF 即将补充。

## Quick Start

请确保已安装 Node.js 18 / 20 LTS、Python 3.10+ 和 npm。平台支持 Windows、macOS 和 Linux。

## Installation

### 环境要求
- Node.js 18 / 20 LTS
- Python 3.10+
- npm
- Windows / macOS / Linux

### 获取代码
```bash
git clone https://github.com/ozoshanniao/Node_Canvas.git
cd Node-AI-Canvas
```

### 后端安装

进入后端目录并设置 Python 虚拟环境：
```bash
cd backend
python -m venv .venv
```

激活虚拟环境：

**Windows PowerShell:**
```powershell
.venv\Scripts\Activate.ps1
```

**macOS / Linux:**
```bash
source .venv/bin/activate
```

安装依赖：
```bash
pip install -r requirements.txt
```

### 前端安装

进入前端目录并安装依赖：
```bash
cd ../frontend
npm install
```

## Running the App

### 推荐启动方式
在前端目录下同时启动前端和后端：
```bash
cd frontend
npm run dev
```

### 手动启动方式
您可以分别运行后端和前端。

**手动后端:**
```bash
cd backend
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

**手动前端:**
```bash
cd frontend
npm run dev
```

**端口说明:**
- `8000` = 后端 API
- `5173` = 前端页面 (或 `5174`，具体取决于 Vite 的输出)

## First Project

在浏览器中打开前端应用。拖拽节点并连接，构建您的第一个工作流。您可以参考 Workflow Examples 章节获取灵感。

## Provider & API Key Configuration

Node-AI-Canvas 支持通过以下两种方式配置 API 密钥和 Provider 选项：

- **推荐方式:** Settings -> Providers (通过 UI 设置)
- **进阶方式:** `backend/.env`

**优先级:**
`.env` > user settings > none

**User Settings 存储路径:**
- Windows: `%APPDATA%/Node-AI-Canvas/settings.json`
- macOS/Linux: `~/.node-ai-canvas/settings.json`

**安全边界:**
- API keys 不会写入 `project.json`。
- API keys 不会写入 `localStorage`。
- API keys 不会返回给前端。
- API keys 不会通过前端的请求头传递。

## Provider Runtime Support Matrix

设置面板可以保存 Provider 密钥，且部分运行时已经开始使用这些设置项。然而，部分运行时仍然需要配置 `.env` 文件。这是阶段性能力边界。

| Provider | 用途 | Settings 字段 | `.env` 变量 | 运行时 Settings 支持 | 备注 |
|---|---|---|---|---|---|
| DeepSeek | 文本生成 | API Key | `DEEPSEEK_API_KEY` | 是 | - |
| Yunwu | 文本 / 图像 / 视频 | API Key | `YUNWU_API_KEY`, `YUNWU_BASE_URL` | 是 | Base URL 仍仅支持通过 `.env` 配置。 |
| Google / Gemini / Veo | 多模态 | API Key | `GOOGLE_CLOUD_API_KEY`, `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION` | 否 | 可能需要配置 project / location。 |
| Kling | 视频生成 | Access Key, Secret Key | `KLING_ACCESS_KEY`, `KLING_SECRET_KEY` | 否 | 需要 access key + secret key。 |
| Seedance | 视频生成 | API Key | `SEEDANCE_API_KEY`, `ARK_API_KEY` | 否 | 素材公网 URL 通常依赖 R2 或其他公开存储。 |
| Cloudflare R2 | 公开素材存储 | Access Key, Secret Key | `CLOUDFLARE_R2_ACCESS_KEY_ID`, `CLOUDFLARE_R2_SECRET_ACCESS_KEY` 等 | 否 | 除 access / secret 外，还需要 bucket / public domain / endpoint 或 account id。 |

## Core Node System

| Node | 分类 | 用途 |
|---|---|---|
| `TextNode` | 输入 | 文本输入和多行编辑 |
| `TextConstructionNode` | 实用工具 | 组合并格式化多个文本输入 |
| `LLMProcessorNode` | 处理 | 使用 LLM 服务处理文本 |
| `ImageInputNode` | 输入 | 从本地文件加载图像 |
| `ImageNode` | 处理 | 处理与生成图像 |
| `AnnotateNode` | 图像标注 | 为图像添加标注或蒙版 |
| `ImageCompareNode` | 实用工具 | 并排比较两张图像 |
| `SplitGridNode` | 实用工具 | 将图像分割为网格 |
| `VideoNode` | 处理 | 生成与播放视频 |
| `OutputNode` | 输出 | 显示最终的文本或视觉输出 |
| `RouteNode` | 实用工具 | 在画布中路由信号或数据 |
| `AR720Node` | 空间 | 在 720 AR 空间中预览图像 |
| `Panorama360Node` | 空间 | 预览 360 度全景图像 |
| `EaseCurveNode` | 动效 | 控制动效缓动曲线 |
| `ShotListNode` | 动效 | 管理序列和镜头列表 |
| `OmniComposerNode` | 高级 | 复杂的多模态组合 |
| `AudioInputNode` | 输入 | 加载音频文件 |
| `VideoInputNode` | 输入 | 加载视频文件 |

## Workflow Examples

**文本工作流:**
```text
TextNode -> LLMProcessorNode -> TextConstructionNode
```
*需要配置: DeepSeek 或 Yunwu LLM API Key.*

**图像工作流:**
```text
ImageInputNode -> ImageNode -> OutputNode
```
*需要配置: Yunwu Image API Key.*

**视频工作流:**
```text
TextNode -> VideoNode
ImageInputNode -> VideoNode
```
*需要配置: Kling, Yunwu Video, 或 Seedance API Key.*

## Local Workspace & Project Save

**工作区结构:**
```text
Workspace/
├── project.json
├── input/
└── generation/
```

**保存机制:**
- `project.json` 保存节点、连线、参数和相对路径
- `project.json` 不保存 API Key
- `project.json` 不保存大体积 base64
- `input/` 保存用户输入素材
- `generation/` 保存生成结果

## Security Model

- **.env priority:** `backend/.env` 文件中的环境变量优先级最高。
- **user settings storage:** 用户设置通过 0o600 文件权限保护，安全地存储在用户配置文件目录（`~/.node-ai-canvas/settings.json`）下，位于项目工作区之外。
- **project save sanitization:** 项目保存时，敏感数据会被清除，以保证 `project.json` 的安全性。
- **no frontend key echo:** 后端不会将 API 密钥返回给前端。
- **no localStorage key persistence:** 前端不会在 `localStorage` 中持久化保存密钥。

## Project Structure

```text
Node-AI-Canvas/
├── backend/            # Python API Service (FastAPI)
├── frontend/           # React + Vite canvas UI
├── skills/             # Local Soft Skills
└── README.md           # Root documentation
```

## FAQ

<details>
<summary>Why does http://127.0.0.1:8000 show 404?</summary>
端口 8000 是后端 API。默认不提供 HTML 页面服务。请打开前端端口（通常为 5173）。
</details>

<details>
<summary>Which URL should I open?</summary>
打开前端 URL，通常是 `http://localhost:5173` 或 `http://localhost:5174`，具体取决于终端中 Vite 输出的地址。
</details>

<details>
<summary>Why does Settings show configured via .env?</summary>
因为在 `backend/.env` 文件中定义的环境变量具有最高优先级，会覆盖界面中的配置。
</details>

<details>
<summary>Can I share project.json safely?</summary>
是的，`project.json` 经过了数据脱敏，不包含 API 密钥或大体积 Base64 数据。不过媒体文件使用的是相对路径，因此建议分享整个工作区文件夹以确保完整功能。
</details>

<details>
<summary>Why does a provider still require .env after saving a key in Settings?</summary>
这是阶段性能力边界。部分服务（如 Google、Kling、Seedance）暂未迁移至运行时 Settings 解析，依然需要从 `.env` 读取配置。
</details>

<details>
<summary>What should I do on Windows path issues?</summary>
请确保在 PowerShell 或标准的命令提示符中执行命令。Python 和 Vite 会自动处理 Windows 下的路径分隔符。
</details>

<details>
<summary>Can I run it on a headless server?</summary>
可以，您可以在远端分别运行后端和前端，并在本地访问前端。但请确保正确配置并保护您的 API 端点。
</details>

## Roadmap

- Expand runtime settings resolver to Google / Kling / Seedance / R2
- Add more workflow templates
- Improve docs and examples
- Improve video provider smoke testing
- Enhance node reference documentation

## License

本项目遵循 MIT 协议。查看 [LICENSE](LICENSE) 获取详情。
