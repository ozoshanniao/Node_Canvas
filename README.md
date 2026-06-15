<p align="center">
  <a href="./README.zh-CN.md">简体中文</a> · <strong>English</strong>
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

Node-AI-Canvas is a multimodal AI node canvas for building creative workflows across text, image, video, annotation, spatial preview, and motion control. It provides an intuitive visual interface to link various AI models and services together, enabling users to prototype, experiment, and run complex generative workflows seamlessly.

## Feature Highlights

### Canvas Workflow
Drag, drop, and connect nodes to define custom pipelines. Save and load projects locally.

### Text & LLM
Advanced LLM nodes for processing language tasks with flexible configuration, prompt enhancement, and official DeepSeek support.

### Image & Annotation
Nodes for image input, generation, and annotation.

### Video Generation
Support for video generation including text-to-video, image-to-video, and multi-frame workflows (start frame, end frame).

### Spatial & Motion
Spatial preview and motion control with specialized nodes like AR720, Panorama360, and EaseCurve.

### Settings & Security
Manage provider API keys securely with user settings and environment variables, backed by a strict security model.

## Screenshots / Demo Placeholder

> Screenshot / demo GIF coming soon.

## Quick Start

Ensure you have Node.js 18 / 20 LTS, Python 3.10+, and npm installed. The platform works on Windows, macOS, and Linux.

## Installation

### Environment Requirements
- Node.js 18 / 20 LTS
- Python 3.10+
- npm
- Windows / macOS / Linux

### Get the Code
```bash
git clone https://github.com/ozoshanniao/Node_Canvas.git
cd Node-AI-Canvas
```

### Backend Installation

Navigate to the backend directory and set up the Python virtual environment:
```bash
cd backend
python -m venv .venv
```

Activate the virtual environment:

**Windows PowerShell:**
```powershell
.venv\Scripts\Activate.ps1
```

**macOS / Linux:**
```bash
source .venv/bin/activate
```

Install the dependencies:
```bash
pip install -r requirements.txt
```

### Frontend Installation

Navigate to the frontend directory and install dependencies:
```bash
cd ../frontend
npm install
```

## Running the App

### Recommended Way
Start both frontend and backend concurrently from the frontend directory:
```bash
cd frontend
npm run dev
```

### Manual Way
You can run the backend and frontend separately.

**Backend:**
```bash
cd backend
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

**Frontend:**
```bash
cd frontend
npm run dev
```

**Ports:**
- `8000` = backend API
- `5173` = frontend app (or `5174` depending on Vite output)

## First Project

Open the frontend app in your browser. Drag and drop nodes to build your first workflow. Check the Workflow Examples section for ideas.

## Provider & API Key Configuration

Node-AI-Canvas supports configuring API keys and provider settings in two ways:

- **Recommended:** Settings -> Providers (via the UI)
- **Advanced:** `backend/.env`

**Priority:**
`.env` > user settings > none

**User Settings Storage Path:**
- Windows: `%APPDATA%/Node-AI-Canvas/settings.json`
- macOS/Linux: `~/.node-ai-canvas/settings.json`

**Security Boundary:**
- API keys are not written to `project.json`.
- API keys are not written to `localStorage`.
- API keys are not returned to the frontend.
- API keys are not passed from the frontend through request headers.

## Provider Runtime Support Matrix

Settings can save provider keys, and some runtimes already use these settings keys. However, some runtimes still require `.env`. This is a staged capability boundary.

| Provider | Use case | Settings fields | `.env` variables | Runtime settings support | Notes |
|---|---|---|---|---|---|
| DeepSeek | Text generation | API Key | `DEEPSEEK_API_KEY` | Yes | - |
| Yunwu | Text / Image / Video | API Key | `YUNWU_API_KEY`, `YUNWU_BASE_URL` | Yes | Base URL remains `.env`-only. |
| Google / Gemini / Veo | Multi-modal | API Key | `GOOGLE_CLOUD_API_KEY`, `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION` | No | May require project / location. |
| Kling | Video generation | Access Key, Secret Key | `KLING_ACCESS_KEY`, `KLING_SECRET_KEY` | No | Requires access key + secret key. |
| Seedance | Video generation | API Key | `SEEDANCE_API_KEY`, `ARK_API_KEY` | No | Public asset URL usually relies on R2 or other public storage. |
| Cloudflare R2 | Public asset storage | Access Key, Secret Key | `CLOUDFLARE_R2_ACCESS_KEY_ID`, `CLOUDFLARE_R2_SECRET_ACCESS_KEY`, etc. | No | Needs bucket, public domain, endpoint, or account id. |

## Core Node System

| Node | Category | Purpose |
|---|---|---|
| `TextNode` | Input | Text input and multi-line editing |
| `TextConstructionNode` | Utility | Combine and format multiple text inputs |
| `LLMProcessorNode` | Processing | Process text using LLM providers |
| `ImageInputNode` | Input | Load images from local files |
| `ImageNode` | Processing | Process and generate images |
| `AnnotateNode` | Image Annotate | Add annotations or masks to images |
| `ImageCompareNode` | Utility | Compare two images side-by-side |
| `SplitGridNode` | Utility | Split images into grids |
| `VideoNode` | Processing | Generate and playback video |
| `OutputNode` | Output | Display final text or visual output |
| `RouteNode` | Utility | Route signals or data across the canvas |
| `AR720Node` | Spatial | Preview images in 720 AR space |
| `Panorama360Node` | Spatial | Preview 360 panoramic images |
| `EaseCurveNode` | Motion | Control motion easing curves |
| `ShotListNode` | Motion | Manage sequences and shot lists |
| `OmniComposerNode` | Advanced | Complex multi-modal composition |
| `AudioInputNode` | Input | Load audio files |
| `VideoInputNode` | Input | Load video files |

## Workflow Examples

**Text workflow:**
```text
TextNode -> LLMProcessorNode -> TextConstructionNode
```
*Requires: DeepSeek or Yunwu LLM API Key.*

**Image workflow:**
```text
ImageInputNode -> ImageNode -> OutputNode
```
*Requires: Yunwu Image API Key.*

**Video workflow:**
```text
TextNode -> VideoNode
ImageInputNode -> VideoNode
```
*Requires: Kling, Yunwu Video, or Seedance API Key.*

## Local Workspace & Project Save

**Workspace Structure:**
```text
Workspace/
├── project.json
├── input/
└── generation/
```

**Save Mechanism:**
- `project.json` saves nodes, connections, parameters, and relative paths.
- `project.json` does not save API Keys.
- `project.json` does not save large base64 strings.
- `input/` saves user input assets.
- `generation/` saves generation results.

## Security Model

- **.env priority:** Environment variables in `backend/.env` take precedence over UI settings.
- **user settings storage:** Settings are stored securely with 0o600 file permission protection in the user profile directory (`~/.node-ai-canvas/settings.json`), outside of the project workspace.
- **project save sanitization:** Sensitive data is stripped before saving to `project.json`.
- **no frontend key echo:** The backend does not send API keys to the frontend.
- **no localStorage key persistence:** The frontend does not store keys in `localStorage`.

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
Port 8000 is the backend API. It does not serve an HTML page by default. Open the frontend port (usually 5173).
</details>

<details>
<summary>Which URL should I open?</summary>
Open the frontend URL, typically `http://localhost:5173` or `http://localhost:5174`, depending on what Vite outputs in the terminal.
</details>

<details>
<summary>Why does Settings show configured via .env?</summary>
Because variables defined in the `backend/.env` file have a higher priority and override the settings configured in the UI.
</details>

<details>
<summary>Can I share project.json safely?</summary>
Yes, `project.json` is sanitized and does not contain API keys or large base64 payloads. However, media paths are relative, so sharing the entire workspace folder is recommended for full functionality.
</details>

<details>
<summary>Why does a provider still require .env after saving a key in Settings?</summary>
This is a staged capability boundary. Some providers (like Google, Kling, Seedance) have not yet been migrated to use runtime settings resolution and still read directly from `.env`.
</details>

<details>
<summary>What should I do on Windows path issues?</summary>
Ensure you are running commands in PowerShell or a standard command prompt. Paths in Python and Vite should handle Windows slashes automatically.
</details>

<details>
<summary>Can I run it on a headless server?</summary>
Yes, you can run the backend and frontend separately and access the frontend remotely, but ensure your API endpoints are correctly routed and secured.
</details>

## Roadmap

- Expand runtime settings resolver to Google / Kling / Seedance / R2
- Add more workflow templates
- Improve docs and examples
- Improve video provider smoke testing
- Enhance node reference documentation

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE).
