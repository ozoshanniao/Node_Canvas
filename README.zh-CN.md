# Node-AI-Canvas

[English README](./README.md)

Node-AI-Canvas 是一个基于节点画布的 AI 工作流工具，用于组合文本、图像和视频生成流程。它提供直观的拖拽交互界面，方便用户连接不同的 AI 模型与服务，从而无缝地构建、测试和运行复杂的生成式工作流。

---

## 功能特性 (Features)

项目目前已支持以下核心能力：
- **可视化节点工作流画布**：支持通过拖拽、连线来灵活配置自定义 AI 执行链路。
- **丰富的多模态节点**：提供文本输入、图像输入、图像处理和视频生成等多种节点类型。
- **LLM 处理器节点**：用于处理各种文本生成任务的通用语言节点，支持高级参数的灵活控制。
- **DeepSeek 官方引擎集成**：无缝对接 DeepSeek 官方 API 提供稳定、低延迟的 LLM 语言服务。
- **本地轻量技能 (Local Soft Skills)**：允许用户通过编写本地 `SKILL.md` 文件（目前由 DeepSeek 官方专属支持）来实现动态提示词注入。
- **快手可灵 (Kling) 与云端 (Yunwu Kling) 视频生成**：集成官方 Kling API 与 Yunwu 中转接口。
- **首尾帧及图生视频工作流**：支持文生视频、图生视频（Image-to-Video）以及首尾双帧（起止帧）的高级视频生成管线。
- **本地项目保存与加载**：可将画布中的所有节点与配置关系本地保存为 JSON 文件，并支持随时重新载入。
- **前后端分离的解耦架构**：前端采用 React/Vite 构建，后端基于轻量高效的 Python FastAPI 提供接口支持。

---

## 项目结构 (Project Structure)

项目主要由以下几部分组成：

```text
Node-AI-Canvas/
├── backend/            # Python API 服务
│   ├── llm/            # 大语言模型接口与解析逻辑
│   ├── video_generation/# 视频生成驱动引擎与 payloads
│   └── tests/          # 后端单元测试
├── frontend/           # React + Vite 前端画布 UI
│   └── src/            # 前端源码与自定义节点实现
├── skills/             # 全局本地轻量技能目录
└── README.md           # 英文主文档链接与内容说明
```

- **`frontend/`**：基于 React Flow (`@xyflow/react`) 开发的可视化画布前端。
- **`backend/`**：提供接口调度、Schema 校验、鉴权认证以及多服务商 Payload 转换的 Python 后端。
- **`skills/`**：存放全局 Local Soft Skills 的动态提示词模块注册中心。

---

## 环境要求 (Requirements)

在部署和启动项目之前，请确保本地已安装以下环境：
- **Node.js**：建议使用版本 18.x 或 20.x
- **npm**：Node.js 自带的包管理器
- **Python**：版本 3.10 及以上
- **pip**：Python 依赖包管理器

---

## 安装 (Installation)

### 1. 前端环境配置
进入前端目录并安装所需的依赖包：
```bash
cd frontend
npm install
```

### 2. 后端环境配置
在项目根目录下安装 Python 依赖（依赖已定义在根目录 `requirements.txt` 中）：
```bash
pip install -r requirements.txt
```

---

## 环境变量 (Environment Variables)

运行后端服务前，需在 `backend` 目录下创建 `.env` 配置文件。切勿将此文件提交到 Git 仓库。

```text
backend/.env
```

请根据以下模板配置服务商参数（具体字段定义与说明可参考 `backend/.env.example`）：

```env
# Google Cloud / Vertex AI (Google GenAI)
GOOGLE_CLOUD_API_KEY=your_google_cloud_api_key
GOOGLE_CLOUD_PROJECT=your_project_id
GOOGLE_CLOUD_LOCATION=us-central1

# 云端 Yunwu AI 接口
YUNWU_API_KEY=your_yunwu_api_key
YUNWU_BASE_URL=https://yunwu.ai
YUNWU_KLING_PATH_PREFIX=/kling

# DeepSeek 官方 API
DEEPSEEK_API_KEY=your_deepseek_api_key

# 官方可灵 API
KLING_ACCESS_KEY=your_kling_access_key
KLING_SECRET_KEY=your_kling_secret_key
KLING_API_BASE=https://api-beijing.klingai.com
```

> [!WARNING]
> 请妥善保管您的 API Keys。请勿将包含真实密钥的 `.env` 提交到公开代码托管平台。

---

## 本地运行 (Running Locally)

### 一键协同启动（推荐）
在前端文件夹中运行以下指令，可同时自动并行启动前端 Vite 开发服务器与 Python 后端服务：
```bash
cd frontend
npm run dev
```
启动后，可在控制台输出的 Vite 服务端口（通常为 `http://localhost:5174` 或 `http://localhost:5173`）访问工作流画布。

---

### 分步手动启动

如果您希望在不同的终端窗口中分别管理前后端服务：

**启动后端 API 服务：**
```bash
cd backend
python main.py
```
*(后端默认将启动并监听 `http://127.0.0.1:8000`)*

**启动前端画布应用：**
```bash
cd frontend
npm run dev
```

---

## 本地软技能 (Local Soft Skills)

本地软技能 (Local Soft Skills) 是一种基于提示词注入（Prompt-injection）的机制，通过解析本地定义的 `SKILL.md` 模板文件来赋予 LLM 特定的场景功能。

### 目录寻址规则
应用会在两个地方动态加载软技能：
1. **全局技能**：位于根目录下的 `skills/<skill-id>/SKILL.md`。
2. **项目级专属技能**：位于工作区下的 `<projectPath>/.node-canvas/skills/<skill-id>/SKILL.md`。

### 技能 ID 命名规范
技能目录的名称即为该技能的唯一 ID。命名必须严格遵循以下规则：
- 仅能使用 **小写英文字母**、**数字**、**连字符** (`-`) 和 **下划线** (`_`)。
- **不得包含空格**。
- **文件夹名称中严禁使用中文字符**。

*示例目录结构：*
```text
skills/
└── prompt-refiner/
    └── SKILL.md
```

### `SKILL.md` 模板示例
文件需要使用 Markdown 语法书写。第一行以 Heading 1 作为技能标题，后续内容为该技能的注入 prompt：
```markdown
# Prompt Refiner

Rewrite rough user input into a clean, concise prompt while preserving the user intent.
```

### 关键细节说明
* **覆盖逻辑**：如果项目级专属技能与全局技能的 ID 相同，则项目级专属技能的 Prompt 会覆盖全局技能。
* **DeepSeek 专属**：目前**仅 DeepSeek 官方引擎**支持本地轻量技能的 Prompt 动态载入。
* **无状态保存**：画布配置 `project.json` 中仅会记录已启用的技能 ID，而 `SKILL.md` 内的具体 Prompt 文本**绝不会**被复制或写入到工程文件中。
* **提示词注入性质**：该机制本质是静态的 Prompt 结构化拼接，**不涉及代码执行**，也不是通常意义上的 Agent 工具调用（Tool Call）。

---

## DeepSeek 官方 (DeepSeek Official)

对接官方 DeepSeek 系列模型：
- **认证鉴权**：使用 `DEEPSEEK_API_KEY` 进行端点请求鉴权。
- **模型能力**：专注于文本生成与推理（Text Generation）。
- **深度思考**：支持在 UI 参数面板中配置可选的 Reasoning 思考过程控制。
- **软技能支持**：全面兼容 Local Soft Skills 动态提示词系统。
- **图像拦截**：在当前应用实现中，DeepSeek 官方引擎暂不支持图像多模态输入。

---

## Kling 视频生成 (Kling Video Generation)

基于快手可灵视频大模型的能力：
- **安全鉴权**：官方可灵接口采用 JWT（Json Web Token）鉴权算法，使用 `KLING_ACCESS_KEY` 和 `KLING_SECRET_KEY` 在后端实时计算生成。
- **执行管线**：
  - **文本生成视频 (Text-to-Video)**：根据文本 prompt 描述生成对应视频。
  - **图片生成视频 (Image-to-Video)**：支持提供首帧图片作为参考。
  - **首尾双帧生成**：支持同时传入首帧图片与尾帧图片（`image_tail`）以精准控制视频的结束画面。
- **专业版模式要求**：对于可灵 V2.6 模型，启用尾帧（`image_tail` / end frame）功能必须将生成参数设置为 **Pro Mode (专业模式)**。
- **画布比例自适应**：前端 `VideoNode` 可基于返回视频的元数据或输入的参考图宽高比，自适应缩放节点物理尺寸和画面预览比例。

---

## 公网素材存储 (Public Asset Storage)

本项目支持将本地素材上传到公网可访问的对象存储（Cloudflare R2 或火山引擎 Volcengine TOS），以便 Seedance 官方接口等外部服务能够拉取并下载输入素材。此功能仅作为临时素材的公网中转访问，并非“永久公开”存储。

### 1. 功能背景与原理
当 Seedance 官方接口等外部服务无法直接读取本地私有路径的文件时，Node-AI-Canvas 会先将素材上传至公网可访问的对象存储，再将生成的公网临时 URL（public URL）传递给 Seedance 服务完成生成。

### 2. 完整配置与数据链路
```text
Settings UI (前端设置面板)
→ appSettings.publicAssetStorage (应用配置)
→ VideoNode payload.publicAssetStorage (节点载荷)
→ backend VideoGenerateRequest.publicAssetStorage (后端请求体)
→ VideoGenerationService (视频生成服务调度)
→ SeedanceOfficialProvider (Seedance官方服务商适配器)
→ seedance_official/assets.py (素材处理模块)
→ PublicAssetService.ensure_public_url(..., storage_provider=...) (公共素材服务)
→ R2PublicAssetBackend / TOSPublicAssetBackend (具体对象存储后端)
→ 产生公网可访问的素材 URL (Public URL)
→ 传递给 Seedance 官方接口进行生成
```

### 3. 前端设置选项
前端 Settings UI 提供了三种公网素材存储选项：
- **Backend .env Default (后端默认)**：不覆盖后端配置，直接使用 `backend/.env` 中配置的 `PUBLIC_ASSET_STORAGE` 变量值。
- **Cloudflare R2**：强制此生成任务使用 Cloudflare R2 进行素材存储与公网化。
- **Volcengine TOS**：强制此生成任务使用火山引擎 TOS（Volcengine TOS）进行素材存储与公网化。

> [!IMPORTANT]
> **安全性设计**：前端不会保存、显示或传递任何云存储密钥（如 AK/SK、Token 等）。所有的 Access Key ID、Secret Access Key、Bucket、Endpoint 以及 Public Domain 等敏感凭证均**只能**安全地配置在后端 `backend/.env` 文件中。

### 4. 传输优化与影响范围
- **影响范围**：`publicAssetStorage` 配置仅影响需要通过公网 URL 传递的素材上传，**不影响**以下已有链路：
  - 小图片优先转 Base64 传输 (`Base64-first`)。
  - 小音频优先转 Base64 传输 (`Base64-first`)。
  - 尾帧下载 (`lastFrame`) 逻辑。
  - 快手可灵 (Kling) 或云端 (Yunwu) 的现有生成链路。

- **Base64-first 传输优化规则**：
  - **图片素材**：若单张原始图片大小 `<= 10MB` 且总图片大小 `<= 40MB`，系统会优先将其转换为 Base64 编码直接嵌入 Payload 中传输，避免上传云存储。
  - **音频素材**：若音频格式为 `wav`/`mp3` 且文件大小 `<= 15MB`，系统会优先将其转换为 Base64 编码直接嵌入 Payload 中传输。
  - **视频参考素材 (Video Reference)**：由于视频文件较大，不支持 Base64 编码，因此**仍会触发公网素材存储**（上传至 R2 或 TOS）以获取公网 URL。

### 5. 云存储参数与权限要求

#### Volcengine TOS 参数说明
- **`VOLCENGINE_TOS_ENDPOINT`**：用于后端 S3-compatible 协议的 `PUT` 上传。北京地域推荐使用：`tos-s3-cn-beijing.volces.com`。
- **`VOLCENGINE_TOS_PUBLIC_DOMAIN`**：用于生成传递给 Seedance 下载素材的公网 URL。可以使用 Bucket public domain（存储桶公网域名），例如：`https://node-canvas-seedance.tos-cn-beijing.volces.com`。
  > [!WARNING]
  > **注意**：请勿把 Bucket public domain 误称为 CDN。只有当您在火山引擎控制台为该存储桶显式绑定了 CDN 或自定义加速域名时，才可以将其称为 CDN。

#### 权限控制要求
- 存储桶（Bucket）**必须允许“公共读” (Public Read)**，否则外部 Seedance 服务将无法拉取并下载素材。
- **严禁开启“公共读写” (Public Read Write)**，以防他人非法上传或篡改，造成越权与资源耗尽风险。
- **推荐权限模型**：公共读、私有写。

#### 生命周期规则建议
强烈建议在您的对象存储（TOS / R2）控制台为临时素材配置生命周期规则，以自动清理过期素材，避免产生不必要的存储费用：
- **前缀限制**：仅针对 `node-canvas/seedance-input/` 目录设置规则。
- **清理规则**：最后修改时间 `5` 天后自动删除。
  > [!CAUTION]
  > 请勿对整个 Bucket 直接配置全局删除规则，以防误删其他用途的持久化文件。

### 6. 后端环境配置示例 (`backend/.env`)

#### Cloudflare R2 配置示例
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

#### Volcengine TOS 配置示例
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

### 7. 推荐测试顺序与 Smoke Test 指南

为了保证集成的平稳上线，建议按照以下步骤进行分阶段测试：

1. **本地回归测试**：
   运行本地单元测试，确认原有核心业务链路不受影响，此时不需要进行真实素材上传。
2. **对象存储 Smoke Test**：
   使用一个很小的本地 `.txt` 文本文件通过上传逻辑，确认能够在 R2 / TOS 中成功生成公网 URL，并使用浏览器或 GET 工具直接访问该 URL，确认能成功返回 `HTTP 200` 且内容正确。
3. **Seedance 真实服务 Smoke Test**：
   在确认存储通道通畅后，再运行真实的 Seedance 生成任务。
   * **推荐测试参数**：
     * **模型 (Model)**: Fast
     * **分辨率 (Resolution)**: 480p
     * **视频时长 (Duration)**: 4s
     * **触发方式**：在 VideoNode 中提供视频参考素材（Video Reference）或上传体积 `> 10MB` 的图片素材，以此强制系统通过 `PublicAssetService` 通路将素材公网化并传递给 Seedance。

---


## 测试 (Testing)

在推送或合并代码之前，建议在本地执行相关测试以确保系统稳定性。

### 后端测试
运行后端单元测试或可灵 API 冒烟测试：
```bash
cd backend
python -m unittest discover -s tests -p "test_*.py"
python kling_smoke_test.py
```

### 前端测试与 Lint 静态分析
运行前端脚本校验、Lint 代码规则检查以及生产环境打包测试：
```bash
cd frontend
npm test
npx eslint src/nodes src/utils
npm run build
```

> [!TIP]
> 如果 Vite 打包命令在沙箱等权限受限环境中因为 `spawn EPERM` 错误中断，请在标准的本地未受限终端中尝试重新执行打包命令。

---

## 开发说明 (Development Notes)

- **接口解耦**：所有与特定厂商相关的 Payload 封装和接口请求逻辑必须放置在对应的适配器文件夹中（如 `backend/video_generation/providers/`），确保架构的高可维护性。
- **保持工作区清洁**：切勿将包含敏感信息的 `.env` 配置文件或本地测试生成的视频、图片等临时媒体资源提交到代码版本库。
- **同步环境变量说明**：如果修改或新增了环境变量依赖，请同步维护并更新 `backend/.env.example`。
- **提示词工程与硬工具链**：本地轻量技能仅用于 Prompt 软约束。当前版本不支持本地代码执行、Agent 代理节点等硬工具链调用。

---

## 许可证 (License)

本项目采用 MIT 许可证。详情请参阅 [LICENSE](LICENSE)。
