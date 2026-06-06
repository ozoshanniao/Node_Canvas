# Node-AI-Canvas

[中文说明](./README.zh-CN.md)

Node-AI-Canvas is a node-based AI workflow canvas for composing text, image, and video generation pipelines. It provides an intuitive visual interface to link various AI models and services together, enabling users to prototype, experiment, and run complex generative workflows seamlessly.

---

## Features

The platform currently supports the following core capabilities:
- **Node-Based Visual Workflow Canvas**: Drag, drop, and connect nodes to define custom pipelines.
- **Rich Multi-Modal Nodes**: Includes nodes for text input, image input, image processing, and video generation.
- **LLM Processor Node**: An advanced node for processing language tasks, with flexible configuration parameters.
- **DeepSeek Official Support**: Integration with official DeepSeek endpoints for reliable LLM services.
- **Local Soft Skills**: Enhance prompts dynamically using prompt-injection modules defined in local `SKILL.md` files (exclusively supported by DeepSeek Official).
- **Kling / Yunwu Kling Video Generation**: Powerful video generation support using both the official Kling API and Yunwu services.
- **Image-to-Video and Multi-Frame Workflows**: Build complex video tasks including image-to-video, first-frame, and end-frame (tail frame) pipelines.
- **Local Project Save/Load**: Save your workflow canvas locally as standard JSON files and load them back at any time.
- **Decoupled Architecture**: Built on a modular Python FastAPI backend and a responsive React/Vite frontend.

---

## Project Structure

The project is structured into three main parts:

```text
Node-AI-Canvas/
├── backend/            # Python API Service (FastAPI / Engines)
│   ├── llm/            # LLM-specific logic and integration
│   ├── video_generation/# Video generation providers & payload engines
│   └── tests/          # Python backend unit tests
├── frontend/           # React + Vite canvas UI
│   └── src/            # Core React codebase & custom nodes
├── skills/             # Global directory for Local Soft Skills
└── README.md           # Root documentation (this file)
```

- **`frontend/`**: A React/Vite-based canvas UI built using modern React Flow (`@xyflow/react`) for highly interactive node editing.
- **`backend/`**: A Python backend service handling API orchestration, authentication, schema validation, and communication with AI providers.
- **`skills/`**: A central registry for prompt-injection module definitions (Local Soft Skills).

---

## Requirements

Before setting up the project, make sure you have the following prerequisites installed:
- **Node.js**: Recommended version 18.x or 20.x
- **npm**: Package manager included with Node.js
- **Python**: Version 3.10 or higher
- **pip**: Python package installer

---

## Installation

### 1. Frontend
Navigate to the frontend directory and install the required npm dependencies:
```bash
cd frontend
npm install
```

### 2. Backend
Navigate to the root or backend directory and install the Python dependencies listed in the root `requirements.txt`:
```bash
pip install -r requirements.txt
```

---

## Environment Variables

To configure backend services, create a `.env` file inside the `backend` directory. Do not commit this file to version control.

```text
backend/.env
```

You can use the following variables as a template (refer to `backend/.env.example` for details):

```env
# Google Cloud / Vertex AI (Google GenAI)
GOOGLE_CLOUD_API_KEY=your_google_cloud_api_key
GOOGLE_CLOUD_PROJECT=your_project_id
GOOGLE_CLOUD_LOCATION=us-central1

# Yunwu AI API
YUNWU_API_KEY=your_yunwu_api_key
YUNWU_BASE_URL=https://yunwu.ai
YUNWU_KLING_PATH_PREFIX=/kling

# DeepSeek Official API
DEEPSEEK_API_KEY=your_deepseek_api_key

# Official Kling API
KLING_ACCESS_KEY=your_kling_access_key
KLING_SECRET_KEY=your_kling_secret_key
KLING_API_BASE=https://api-beijing.klingai.com
```

> [!WARNING]
> Keep your API keys private. Never commit the `.env` file or expose actual credentials in public repositories.

---

## Running Locally

### All-in-One Dev Start (Recommended)
You can start both the frontend Vite dev server and the backend Python service concurrently using a single command from the `frontend` folder:
```bash
cd frontend
npm run dev
```
By default, the Vite frontend will run on the port outputted by Vite (typically `http://localhost:5174` or `http://localhost:5173`).

---

### Manual / Separate Startup

If you prefer to run the services in separate terminals:

**Backend Service:**
```bash
cd backend
python main.py
```
*(Runs the Python backend server, by default listening on `http://127.0.0.1:8000`)*

**Frontend App:**
```bash
cd frontend
npm run dev
```

---

## Local Soft Skills

Local Soft Skills are prompt-injection based modules loaded from `SKILL.md` files at runtime. They allow users to quickly refine or format prompts without hardcoded configurations.

### Directory Resolution
The application searches for local soft skills in two locations:
1. **Global Skills**: Under `skills/<skill-id>/SKILL.md` in the project root.
2. **Project-Specific Skills**: Under `<projectPath>/.node-canvas/skills/<skill-id>/SKILL.md` within your active project workspace.

### Naming Conventions (Skill ID Rules)
To ensure compatibility, skill directory names (which determine their ID) must follow these rules:
- Must contain only **lowercase letters**, **numbers**, **hyphens** (`-`), and **underscores** (`_`).
- **No spaces** allowed.
- **No Chinese characters** or special punctuation allowed in folder names.

*Example Directory Structure:*
```text
skills/
└── prompt-refiner/
    └── SKILL.md
```

### `SKILL.md` Template Example
The file should begin with a top-level Heading 1 for the skill's name, followed by its prompt context:
```markdown
# Prompt Refiner

Rewrite rough user input into a clean, concise prompt while preserving the user intent.
```

### Key Notes
* **Override Logic**: Project-level skills override global skills with the exact same ID.
* **DeepSeek Exclusive**: Currently, **only DeepSeek Official** supports Local Soft Skills prompt injections.
* **Stateless Projects**: Enabled skill IDs are stored within `project.json` for reference, but the contents of `SKILL.md` are **never** copied or written into project files.
* **Soft Injection**: These are prompt-based templates and **do not** run any code or perform tool/agent function execution.

---

## DeepSeek Official

Integration with official DeepSeek models:
- **Authentication**: Uses `DEEPSEEK_API_KEY` for request authentication.
- **Supported Capabilities**: Focuses on high-quality text generation tasks.
- **Thinking Control**: Supports optional thinking/reasoning control configurations if provided in the node details.
- **Local Skills**: Fully compatible with the Local Soft Skills prompt framework.
- **Limitation**: Image input capabilities are not supported for DeepSeek Official in this application.

---

## Kling Video Generation

Advanced video generation powered by Kling AI:
- **Authentication**: Official Kling uses JSON Web Token (JWT) authentication, computed securely from `KLING_ACCESS_KEY` and `KLING_SECRET_KEY`.
- **Workflows Supported**:
  - **Text-to-Video**: Standard text prompt generation.
  - **Image-to-Video**: Seed generations from a starting image.
  - **Tail-Frame Workflow**: Supports both start frame (`image`) and end frame (`image_tail`) tasks.
- **Pro Mode Requirements**: For Kling V2.6, utilizing the tail frame (`image_tail` / end frame) requires **Pro Mode** to be active.
- **Adaptive Preview**: The `VideoNode` UI dynamically adapts its layout and display size according to video metadata or the input image's aspect ratio.

---

## Public Asset Storage (R2 / TOS Configuration)

The platform supports uploading local media assets to a publicly accessible object storage service (Cloudflare R2 or Volcengine TOS). This enables external services like the official Seedance API to read and fetch input assets. This feature acts as a temporary public transit point and is not intended for "permanent public" storage.

### 1. Background & Mechanism
When the official Seedance API cannot directly read local private files, Node-AI-Canvas will upload the assets to a public object storage bucket first, and then pass the generated public URL to Seedance.

### 2. Complete Data & Configuration Flow
```text
Settings UI
→ appSettings.publicAssetStorage
→ VideoNode payload.publicAssetStorage
→ backend VideoGenerateRequest.publicAssetStorage
→ VideoGenerationService
→ SeedanceOfficialProvider
→ seedance_official/assets.py
→ PublicAssetService.ensure_public_url(..., storage_provider=...)
→ R2PublicAssetBackend / TOSPublicAssetBackend
→ Publicly Accessible Asset URL
→ Seedance Official API
```

### 3. Frontend Settings
The Frontend Settings UI offers three public asset storage configurations:
- **Backend .env Default**: Does not override backend configurations; uses the default `PUBLIC_ASSET_STORAGE` specified in `backend/.env`.
- **Cloudflare R2**: Forces the current video generation task to use Cloudflare R2 for asset storage.
- **Volcengine TOS**: Forces the current video generation task to use Volcengine TOS for asset storage.

> [!IMPORTANT]
> **Security by Design**: The frontend never saves, displays, or transmits any cloud storage credentials (such as Access Keys, Secret Keys, Tokens, etc.). All credentials (Access Key ID, Secret Access Key, Bucket, Endpoint, and Public Domain) must be configured securely on the backend in `backend/.env`.

### 4. Optimized Transmission & Scope of Impact
- **Scope of Impact**: The `publicAssetStorage` setting only affects assets that must be resolved to a public URL. It **does not affect** the following existing flows:
  - Small images optimized using the `Base64-first` rule.
  - Small audio files optimized using the `Base64-first` rule.
  - Last-frame (`lastFrame`) download logic.
  - Existing Kling or Yunwu Kling generation flows.

- **Base64-first Rules**:
  - **Images**: If a single original image is `<= 10MB` and the total size of all input images is `<= 40MB`, the system will prioritize converting them into Base64 strings embedded directly in the API payload, avoiding any cloud storage uploads.
  - **Audio**: If the audio is in `wav`/`mp3` format and the file size is `<= 15MB`, it will be converted into a Base64 string directly inside the payload.
  - **Video Reference**: Since video references are typically large and do not support Base64 transmission, they **will always trigger public asset storage** (R2 or TOS) to obtain a public URL.

### 5. Cloud Storage Parameters & Permission Requirements

#### Volcengine TOS Parameter Details
- **`VOLCENGINE_TOS_ENDPOINT`**: Used for backend S3-compatible PUT uploads. Recommended for Beijing region: `tos-s3-cn-beijing.volces.com`.
- **`VOLCENGINE_TOS_PUBLIC_DOMAIN`**: Used to build the public URL passed to Seedance. You can use the Bucket public domain, e.g., `https://node-canvas-seedance.tos-cn-beijing.volces.com`.
  > [!WARNING]
  > **Note**: Do not call the Bucket public domain a CDN domain unless a CDN or custom acceleration domain is explicitly bound in the Volcengine console.

#### Permission Requirements
- The Bucket **must be configured as "Public-Read" (Public Read)**, otherwise external services like Seedance will not be able to download the assets.
- **"Public-Read-Write" is strictly prohibited** for security reasons to prevent unauthorized write access or resource exhaustion.
- **Recommended Permission Model**: Public Read / Private Write.

#### Lifecycle Rules Recommendations
It is highly recommended to configure a lifecycle rule in your cloud console (TOS / R2) to automatically clean up expired assets and avoid unnecessary costs:
- **Prefix Filter**: Limit the rule strictly to `node-canvas/seedance-input/`.
- **Cleanup Rule**: Automatically delete files `5` days after their last modified date.
  > [!CAUTION]
  > Do not configure a global deletion rule on the entire Bucket to avoid accidentally deleting other persistent files.

### 6. Backend Configuration Example (`backend/.env`)

#### Cloudflare R2 Configuration Example
```env
PUBLIC_ASSET_STORAGE=r2
PUBLIC_ASSET_PREFIX=node-canvas/seedance-input/
PUBLIC_ASSET_RETENTION_DAYS=5
PUBLIC_ASSET_CACHE_TTL_DAYS=4

CLOUDFLARE_R2_ACCOUNT_ID=your-account-id
CLOUDFLARE_R2_ACCESS_KEY_ID=your-access-key-id
CLOUDFLARE_R2_SECRET_ACCESS_KEY=your-secret-access-key
CLOUDFLARE_R2_BUCKET_NAME=node-canvas-seedance
CLOUDFLARE_R2_PUBLIC_DOMAIN=https://your-public-domain.example.com
CLOUDFLARE_R2_ENDPOINT=
```

#### Volcengine TOS Configuration Example
```env
PUBLIC_ASSET_STORAGE=tos
PUBLIC_ASSET_PREFIX=node-canvas/seedance-input/
PUBLIC_ASSET_RETENTION_DAYS=5
PUBLIC_ASSET_CACHE_TTL_DAYS=4

VOLCENGINE_TOS_ACCESS_KEY_ID=your-access-key-id
VOLCENGINE_TOS_SECRET_ACCESS_KEY=your-secret-access-key
VOLCENGINE_TOS_BUCKET_NAME=node-canvas-seedance
VOLCENGINE_TOS_REGION=cn-beijing
VOLCENGINE_TOS_ENDPOINT=tos-s3-cn-beijing.volces.com
VOLCENGINE_TOS_PUBLIC_DOMAIN=https://node-canvas-seedance.tos-cn-beijing.volces.com
```

### 7. Recommended Testing Sequence & Smoke Test Guide

To ensure a smooth integration launch, please follow these progressive testing steps:

1. **Local Regression Tests**:
   Run the local backend unit tests to ensure that the core existing workflows function without any regressions. No actual assets will be uploaded.
2. **Object Storage Smoke Test**:
   Upload a very small local `.txt` file using the storage backend. Verify that the public URL is correctly generated and returns `HTTP 200` with the correct content when queried via a browser or GET request tool.
3. **Seedance Service Smoke Test**:
   Once storage uploads are verified, perform a real Seedance generation test.
   * **Recommended Parameters**:
     * **Model**: Fast
     * **Resolution**: 480p
     * **Duration**: 4s
     * **Trigger**: Attach a video reference or upload an image `> 10MB` in the `VideoNode` to force the workflow through `PublicAssetService`.

---

## Testing

Keep the codebase robust by running tests before committing changes.

### Backend Tests
Discover backend unit tests or run Kling smoke verification:
```bash
cd backend
python -m unittest discover -s tests -p "test_*.py"
python kling_smoke_test.py
```

### Frontend Verification
Run frontend tests, check styles and syntax via ESLint, and verify successful production bundling:
```bash
cd frontend
npm test
npx eslint src/nodes src/utils
npm run build
```

> [!TIP]
> If the Vite production build fails in a restricted terminal sandbox with a `spawn EPERM` error, please run the build command in a standard, unrestricted local terminal.

---

## Development Notes

- **Modularity**: Always keep provider-specific payloads and logic isolated within their respective directories (e.g., `backend/video_generation/providers/`).
- **Clean Workspace**: Never commit `.env` configuration files or temporary generated media outputs to Git.
- **Environment Templates**: Update `backend/.env.example` if you introduce any new environment variables to keep other developers aligned.
- **Soft Prompting vs. Tool Execution**: Local Soft Skills are exclusively designed for soft prompt engineering. Hard tools or `AgentNode` execution capabilities are not supported in the current implementation.

---

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE).
