# Video Capability Schema v1

Phase 0 freezes the final contract. Phase 1 exposes backend model capability schemas as the canonical source of truth for video model capabilities. This phase does not refactor VideoNode, does not add providers, and does not change the real video generation create/query runtime path.

Old `project.json` compatibility is not the primary goal for this round. The target is a clean future architecture with no long-term legacy fields, no frontend hard-coded provider/model capability ownership, and backend capabilities driving VideoNode in later phases.

## Model Capability Schema v1 Fields

- `schemaVersion`: fixed integer, `1`.
- `provider`: provider id, for example `kling`, `yunwu`, `google`, or `seedance_official`.
- `model`: provider model id.
- `displayName`: user-facing model label.
- `family`: model family such as `kling`, `veo`, or `seedance`.
- `mediaType`: fixed string, `video`.
- `taskTypes`: supported generation modes.
- `inputCapabilities`: stable input handle map.
- `outputCapabilities`: stable output handle map.
- `parameters`: canonical model parameters with `type`, `label`, `default`, `group`, and `ui`.
- `quickParams`: parameter keys for primary controls.
- `advancedParams`: parameter keys for advanced controls.
- `hiddenParams`: backend adapter-only defaults. Do not show in UI or persist to `project.json`.
- `uiHints`: frontend hints only.
- `adapterHints`: backend adapter-only hints. Do not show in UI or persist to `project.json`.
- `featured`, `experimental`, `deprecated`: model lifecycle flags.

Frontend-consumable fields are `schemaVersion`, `provider`, `model`, `displayName`, `family`, `mediaType`, `taskTypes`, `inputCapabilities`, `outputCapabilities`, `parameters`, `quickParams`, `advancedParams`, `uiHints`, `featured`, `experimental`, and `deprecated`.

Adapter-only fields are `adapterHints` and `hiddenParams`.

## Stable VideoNode Ports

The stable VideoNode handle ids are:

- `text:prompt`
- `image:firstFrame`
- `image:lastFrame`
- `image:references`
- `video:references`
- `audio:references`
- `omniParams:in`
- `video:out`

These handle ids should remain stable. When a model does not support a port, future frontend work should disable that handle rather than physically deleting it. Phase 1 only outputs capability information and does not refactor VideoNode.

## Future VideoNode Data Shape

Future VideoNode data should keep core model selection separate from parameter values:

```json
{
  "provider": "kling",
  "model": "kling-v3",
  "taskType": "text-to-video",
  "params": {
    "aspectRatio": "16:9",
    "duration": "5s",
    "seed": -1
  },
  "schemaSnapshot": {}
}
```

Legacy fields such as provider-specific `customParams`, historical handle names, and UI-owned capability flags should be removed in later phases after the schema-driven VideoNode exists.

## Future project.json Strategy

`project.json` should persist the selected provider/model/task type, user parameter values, graph state, and a trimmed `schemaSnapshot`. It must not persist runtime task state as the canonical model capability source. Old `project.json` compatibility is not the primary goal of Phase 0/1.

The goal of `schemaSnapshot` is future project structure reproduction, offline readability, and port-state replay. It cannot guarantee that a real third-party model will still run after that provider removes or changes the remote model.

## schemaSnapshot Trimming Rules

`build_model_schema_snapshot(capability)` produces a persistable snapshot with:

- schema identity fields
- `provider`, `model`, `displayName`, `family`, `mediaType`, `taskTypes`
- `inputCapabilities`
- `outputCapabilities`
- `parameterSummary`
- lifecycle flags

`parameterSummary` stores only parameter name, type, group, default value, and enum options when present.

The snapshot must not store `adapterHints`, `hiddenParams`, full `uiHints`, raw provider payloads, full OpenAPI schemas, API keys, authorization headers, base64 media, local absolute paths, or temporary task state.

## Fields That Must Never Be Saved

Do not save API keys, Authorization headers, bearer tokens, raw provider payloads, full OpenAPI schemas, full third-party raw schemas, base64 media payloads, local absolute paths, temporary task state, secrets, access keys, or private keys in schema output or `project.json`.

## Phase 1 API Contract

`GET /api/video/model-specs` and the existing `/api/video/specs` alias return a Phase 1 bridge:

```json
{
  "schemaVersion": 1,
  "providers": [],
  "models": [],
  "capabilities": []
}
```

`capabilities` is the new canonical Capability Schema v1 list. `providers` and `models` are temporary bridge fields for the current frontend and should be removed in Phase 2/3 after VideoNode consumes capabilities directly.

Phase 1 does not change the provider runtime behavior, API key settings logic, real create/query request chain, or VideoNode UI.

## Key Parameter Policy

Capability Schema v1 includes parameter metadata only where the current runtime path already supports or consumes that setting. The current policy is:

- Google Veo: exposes `negativePrompt`, `generateAudio`, `aspectRatio`, `duration`, `resolution`, `seed`, and `numberOfVideos`.
- Yunwu Veo: exposes `negativePrompt` because the provider payload maps it to `negative_prompt`; exposes `enableUpsample` and `enhancePrompt`.
- Kling: exposes `negativePrompt`, `generateAudio`, `cfgScale` where present, and `cameraControl` as provider-specific metadata where the existing UI/runtime supports it.
- Seedance: exposes `generateAudio`, `returnLastFrame`, `aspectRatio`, `duration`, `resolution`, and `seed`; it does not expose `negativePrompt` by default.

Parameter groups remain limited to `basic`, `advanced`, and `hidden`. Hidden parameters are adapter defaults or fixed runtime hints and are not intended for frontend display.

## Phase 2 VideoNode Behavior

VideoNode reads `capabilities` from `GET /api/video/model-specs` and resolves the selected capability by `provider + model`, with `taskType` used as an optional refinement when a later schema version exposes task-specific records. The Phase 1 bridge fields `providers` and `models` remain in the response for current selector compatibility.

The visible VideoNode input ports are now the stable handle set:

- `text:prompt`
- `image:firstFrame`
- `image:lastFrame`
- `image:references`
- `video:references`
- `audio:references`
- `omniParams:in`

The stable output port is `video:out`.

Unsupported ports stay rendered and are visually dimmed. Required ports show `*` next to the hover label. Optional ports use the normal handle style. Missing capability data falls back to conservative handle states and shows a lightweight node status hint instead of throwing.

VideoNode no longer prunes existing edges when provider, model, task type, quality mode, or other parameters change. Connection validation and runtime payload behavior are unchanged in Phase 2. Legacy input handles such as `image:images`, `image:end`, and `multiPrompt:in`, plus the legacy `image:lastFrame` output, are kept as temporary invisible bridge handles so existing projects and multi-shot inputs keep their edge anchors while new visible UI moves to stable handles.

These legacy bridge handles are not the final architecture. They are kept only to avoid breaking current in-session edges while the new schema-driven VideoNode data contract is unfinished. They must be removed after Phase 3/4 when `project.json` and `node.data` move to the final clean structure. The final stable handle set remains only:

- `text:prompt`
- `image:firstFrame`
- `image:lastFrame`
- `image:references`
- `video:references`
- `audio:references`
- `omniParams:in`
- `video:out`

## Phase 3 Saved VideoNode Data

Newly saved project data uses the clean VideoNode contract:

```json
{
  "provider": "google",
  "model": "veo-3.1-generate-001",
  "taskType": "text-to-video",
  "params": {},
  "schemaSnapshot": {},
  "outputs": {}
}
```

`provider`, `model`, and `taskType` are the core model selection state. `params` stores user-configurable parameter values only. `schemaSnapshot` is a trimmed capability snapshot used for offline readability and future port-state replay. `outputs` stores restorable relative workspace paths or API proxy URLs, such as `generation/video.mp4` and `/api/generation/video.mp4`.

Phase 3 does not perform a complex old `project.json` migration. Runtime code has a temporary loader/runtime bridge that can read older flat fields such as `videoMode`, `aspectRatio`, and `outputs.videoUrl`, but save always sanitizes video node data back to the clean structure.

The saved `schemaSnapshot` includes only:

- `schemaVersion`
- `provider`
- `model`
- `displayName`
- `family`
- `mediaType`
- `taskTypes`
- `inputCapabilities`
- `outputCapabilities`
- `parameterSummary`
- `featured`
- `experimental`
- `deprecated`

It must not include full `parameters`, `adapterHints`, `hiddenParams`, full `uiHints`, raw schemas, API keys, or raw provider payloads.

Project save sanitization removes API keys, authorization headers, bearer tokens, access keys, secret keys, private keys, raw provider responses, raw/OpenAPI schemas, base64 media, blob URLs, local absolute paths, transient task state, polling state, `Error` instances, and `File`/`Blob` objects. It preserves relative generated media paths and API proxy URLs needed to reopen project-local outputs.

## Phase 4 Dynamic Advanced Parameters

VideoNode keeps the core controls custom and stable: provider, model, task type/mode, aspect ratio, duration, resolution, audio generation, and seed remain first-class UI controls. Advanced controls are rendered from Capability Schema v1 by reading `parameters` entries whose `group` is `advanced`, ordered by `advancedParams` when present.

Hidden parameters, `hiddenParams`, `adapterHints`, and raw provider schemas are never rendered. Deprecated parameters are hidden unless the current node already has a saved value for that parameter. Provider-specific advanced parameters can keep a temporary custom UI when needed, but their visibility is still gated by the capability schema. `cameraControl` currently uses the existing Kling UI bridge only when `parameters.cameraControl` or the legacy model capability marks it supported.

Dynamic advanced text, number, slider, object, and textarea controls keep local edit state and commit to `data.params[paramName]` on blur or Enter. Select and boolean controls commit immediately. Phase 4 does not change the real create/query payload builders, backend video services, provider adapters, API key settings, legacy bridge handles, or the `/api/video/model-specs` bridge.

## Phase 5.0 Provider Adapter Contract

Phase 5.0 adds a backend-only adapter contract layer without moving any real provider runtime. The real Yunwu, Google Veo, Kling, Yunwu-Kling, and Seedance create/query paths still run through the existing `VideoGenerationService` provider instances.

The adapter contract is defined by `VideoProviderAdapter` with:

- `provider`
- `adapter_id`
- `supports(capability)`
- `build_create_payload(request, capability)`
- `create(request, capability)`
- `query(request, capability)`

The unified internal request/result types are:

- `VideoInputAsset`
- `VideoCreateRequest`
- `VideoQueryRequest`
- `VideoCreateResult`
- `VideoQueryResult`

These types must not carry API keys, authorization headers, bearer tokens, raw schemas, or base64 media payloads. Asset paths, when present, should be workspace-relative or already sanitized. Mapping sanitized project assets to provider-ready URLs is reserved for later Phase 5.x work.

The unified error layer is `VideoProviderError`, plus `VideoProviderAdapterNotFound` for missing registry entries. Error classification currently maps common provider messages to `auth_error`, `permission_error`, `quota_error`, `rate_limited`, `validation_error`, `safety_error`, `network_error`, `provider_error`, `timeout`, or `unknown`.

The adapter registry exposes:

- `register_video_adapter(adapter)`
- `get_video_adapter(provider)`
- `list_video_adapters()`
- `has_video_adapter(provider)`
- `resolve_adapter_for_capability(capability)`
- `register_legacy_video_adapter(provider, adapter_id)`

The registry is local metadata only. Importing it must not make network calls and must not read real API keys. Phase 5.3a provider registrations are:

- `yunwu` -> `yunwu:veo`
- `google` -> `google:veo`
- `kling` -> `kling:official`
- `yunwu-kling` -> `yunwu-kling:kling`
- `seedance_official` -> `seedance:official`

Capabilities connect to adapters through non-sensitive `adapterHints`:

```json
{
  "adapterHints": {
    "adapterId": "kling:official",
    "runtime": "adapter"
  }
}
```

`adapterHints` is adapter-only metadata. It must not be rendered in frontend UI, included in `schemaSnapshot`, or persisted to `project.json`. It must never contain API keys, endpoint secrets, authorization headers, bearer tokens, raw schemas, or base64 media.

Future migration plan:

- Phase 5.1: migrate Yunwu Video behind `VideoProviderAdapter`.
- Phase 5.2: migrate Google Veo behind `VideoProviderAdapter`.
- Phase 5.3: migrate Kling behind `VideoProviderAdapter`.
- Phase 5.4: migrate Seedance behind `VideoProviderAdapter`.

## Phase 5.1 Yunwu Video Adapter

Phase 5.1 migrates only `provider: yunwu` video generation to the adapter registry. Yunwu Veo models now resolve to `adapterHints.adapterId = "yunwu:veo"` and `adapterHints.runtime = "adapter"`. Google Veo, Kling, Yunwu-Kling, and Seedance remain on the legacy runtime path.

`YunwuVideoAdapter` reuses the existing `YunwuVeoProvider` create/query implementation. The legacy provider owns the payload builder, so field names and defaults stay compatible with the pre-migration runtime:

- `model`
- `prompt`
- `images`
- `aspect_ratio`
- `enhance_prompt`
- `enable_upsample`
- `negative_prompt`
- `veo_fl_close`

The service layer routes only Yunwu create/query through `get_video_adapter("yunwu")`. It still feeds the adapter raw response into the existing task id extraction, status/message normalization, task persistence, and output download flow. Public backend API responses, frontend polling behavior, API key resolution, project save shape, `/api/video/model-specs`, and legacy VideoNode bridge handles are unchanged.

`adapterHints` remains adapter-only metadata and is still excluded from `schemaSnapshot` and `project.json`. Phase 5.2+ will migrate the remaining providers one at a time.

## Phase 5.2 Google Veo Adapter

Phase 5.2 migrates only `provider: google` video generation to the adapter registry. Google Veo models now resolve to `adapterHints.adapterId = "google:veo"` and `adapterHints.runtime = "adapter"`. Yunwu remains on the Phase 5.1 adapter. At the end of Phase 5.2, Kling, Yunwu-Kling, and Seedance remain on the legacy runtime path.

`GoogleVeoVideoAdapter` reuses the existing `GoogleVeoProvider` SDK create/query implementation. The legacy provider owns the source/config builder, so Google SDK behavior, operation names, task id extraction, error messages, file saving, and public API response shape remain compatible with the pre-migration runtime.

The compatibility contract preserves the current source/config behavior for:

- `model`
- `prompt`
- `image`
- `lastFrame`
- `referenceImages`
- `aspectRatio`
- `durationSeconds`
- `personGeneration`
- `resolution`
- `generateAudio`
- `seed`
- `numberOfVideos`
- `negativePrompt`

The service layer routes only Google create/query through `get_video_adapter("google")`. It still feeds the adapter raw response into the existing status/message normalization, task persistence, video byte saving, remote download flow, and frontend polling contract. No frontend UI, project save structure, `/api/video/model-specs` bridge, or legacy VideoNode bridge handle changes are included in Phase 5.2.

`adapterHints` remains adapter-only metadata and is still excluded from `schemaSnapshot` and `project.json`. Phase 5.3+ will migrate Kling and Yunwu-Kling, with Seedance after that.

## Phase 5.3a Kling Official Adapter

Phase 5.3a migrates only official `provider: kling` video generation to the adapter registry. Kling official models now resolve to `adapterHints.adapterId = "kling:official"` and `adapterHints.runtime = "adapter"`.

This phase does not migrate `provider: yunwu-kling` or `provider: seedance_official`. Yunwu remains on the Phase 5.1 `YunwuVideoAdapter`, Google remains on the Phase 5.2 `GoogleVeoVideoAdapter`, Yunwu-Kling remains on the legacy Kling provider path, and Seedance remains on its legacy runtime path.

`KlingVideoAdapter` reuses the existing official `KlingVideoProvider` create/query implementation. The legacy provider still owns endpoint selection, JWT/API key lookup timing, HTTP client construction, payload field names, task id parsing, status/message mapping, and result URL extraction. Adapter import and registry initialization must not read real AK/SK values, create JWTs, or perform network requests.

The official Kling payload compatibility contract preserves the current legacy behavior for:

- `model_name`
- `prompt`
- `negative_prompt`
- `image`
- `image_tail`
- `image_list`
- `video_list`
- `element_list`
- `multi_shot`
- `shot_type`
- `multi_prompt`
- `sound`
- `mode`
- `aspect_ratio`
- `duration`
- `watermark_info`
- `camera_control`
- `callback_url`
- `external_task_id`

The service layer routes only `provider == "kling"` create/query through `get_video_adapter("kling")`. It still feeds the adapter raw response into the existing provider task id extraction, status/message normalization, task persistence, video download flow, and frontend polling contract. Public API response shape, project save structure, frontend VideoNode UI, `/api/video/model-specs`, and legacy bridge handles are unchanged.

`adapterHints` remains adapter-only metadata and is still excluded from `schemaSnapshot` and `project.json`. At the end of Phase 5.3a, Yunwu-Kling is reserved for Phase 5.3b, and Seedance is reserved for Phase 5.4.

## Phase 5.3b Yunwu-Kling Adapter

Phase 5.3b migrates only `provider: yunwu-kling` video generation to the adapter registry. Yunwu-Kling models now resolve to `adapterHints.adapterId = "yunwu-kling:kling"` and `adapterHints.runtime = "adapter"`.

Yunwu-Kling is intentionally separate from both Yunwu Veo and Kling Official. The adapter reuses the existing `KlingVideoProvider(provider_type="yunwu-kling")` runtime so endpoint selection, payload construction, task id parsing, query response mapping, and Yunwu-hosted Kling authentication remain compatible with the pre-migration behavior. It does not reuse the official Kling client path.

This phase does not migrate `provider: seedance_official`. Yunwu remains on the Phase 5.1 `YunwuVideoAdapter`, Google remains on the Phase 5.2 `GoogleVeoVideoAdapter`, Kling Official remains on the Phase 5.3a `KlingVideoAdapter`, and Seedance remains on its legacy runtime path.

The Yunwu-Kling payload compatibility contract preserves the current legacy behavior for:

- `model_name`
- `prompt`
- `negative_prompt`
- `image`
- `image_tail`
- `image_list`
- `video_list`
- `element_list`
- `multi_shot`
- `shot_type`
- `multi_prompt`
- `sound`
- `mode`
- `aspect_ratio`
- `duration`
- `watermark_info`
- `camera_control`
- `callback_url`
- `external_task_id`

The service layer routes only `provider == "yunwu-kling"` create/query through `get_video_adapter("yunwu-kling")`. The adapter raw response still flows through the existing task id extraction, status/message normalization, task persistence, video download flow, and frontend polling contract. Public API response shape, project save structure, frontend VideoNode UI, `/api/video/model-specs`, API key settings, and legacy bridge handles are unchanged.

`adapterHints` remains adapter-only metadata and is still excluded from `schemaSnapshot` and `project.json`. At the end of Phase 5.3b, Seedance is reserved for Phase 5.4.

## Phase 5.4 Seedance Official Adapter

Phase 5.4 migrates only `provider: seedance_official` video generation to the adapter registry. Seedance Official models now resolve to `adapterHints.adapterId = "seedance:official"` and `adapterHints.runtime = "adapter"`.

This is the final migration for the existing video providers covered by the Phase 5 adapter standardization. Yunwu remains on `YunwuVideoAdapter`, Google remains on `GoogleVeoVideoAdapter`, Kling Official remains on `KlingVideoAdapter`, and Yunwu-Kling remains on `YunwuKlingVideoAdapter`. No new provider, remote model discovery, experimental model path, frontend UI change, project save change, `/api/video/model-specs` removal, or legacy bridge handle removal is included.

`SeedanceOfficialVideoAdapter` reuses the existing `SeedanceOfficialProvider` runtime. The provider still owns asset resolution, public asset upload selection, payload construction, HTTP client behavior, task id parsing, query status mapping, video URL extraction, and last-frame URL extraction. Adapter import and registry initialization must not read real credentials, perform network requests, or upload R2/TOS assets.

The Seedance payload compatibility contract preserves the current legacy behavior for:

- `model`
- `prompt`
- `content`
- image, video, and audio reference ordering
- prompt reference normalization
- `ratio`
- `duration`
- `resolution`
- `seed`
- `generate_audio`
- `return_last_frame`
- `watermark: false`

The R2/public asset flow remains owned by the existing Seedance provider and `PublicAssetService` path. Small supported images and audio can still use the existing base64-first path; large images, video references, and configured public asset storage still use the same public URL generation, object key, cache, storage-provider override, and env-gated smoke behavior. Ordinary adapter tests mock the public asset service and do not upload real R2/TOS objects.

The service layer routes only `provider == "seedance_official"` create/query through `get_video_adapter("seedance_official")`. The adapter raw response still flows through the existing task id extraction, status/message normalization, task persistence, remote video download, return-last-frame download, and frontend polling contract. Public API response shape remains compatible with the pre-migration runtime.

`adapterHints` remains adapter-only metadata and is still excluded from `schemaSnapshot` and `project.json`.

## Phase 5.5 Provider Adapter Cleanup

Phase 5.5 closes the migration of existing video providers to the backend adapter registry. The current default adapter map is:

- `yunwu` -> `yunwu:veo`
- `google` -> `google:veo`
- `kling` -> `kling:official`
- `yunwu-kling` -> `yunwu-kling:kling`
- `seedance_official` -> `seedance:official`

The cleanup scope is test and architecture hardening only. It does not change real provider payloads, create/query public API response shapes, frontend VideoNode UI, project save structure, `/api/video/model-specs`, or legacy bridge handles.

Adapter internals normalize provider task status into the Phase 5 adapter status set:

- `queued`
- `running`
- `succeeded`
- `failed`
- `canceled`
- `unknown`

The service layer still converts adapter raw responses through the existing legacy normalization paths so frontend polling behavior remains compatible.

Registry and import-time safety tests verify that importing adapter modules and initializing the default registry do not create external provider clients, generate Kling JWTs, send network requests, upload R2/TOS objects, or write project files. Provider clients, credentials, public asset uploads, and SDK calls remain deferred until real create/query/build operations.

`adapterHints` remains backend-only adapter routing metadata. It is still excluded from `schemaSnapshot` and must not be persisted to `project.json`; frontend code continues to consume the trimmed capability schema and saved project data shape. New providers and model discovery are reserved for Phase 6.

## Phase 6.0 Provider Settings And Asset Upload Router

Phase 6.0 adds provider settings and asset upload routing foundations for KIE, FAL, and WaveSpeed. It does not register new video capabilities, does not create production video adapters for those providers, does not expose them in VideoNode, and does not change the existing Yunwu, Google, Kling Official, Yunwu-Kling, or Seedance runtime paths.

The provider settings layer can resolve `KIE_API_KEY`, `FAL_API_KEY`, and `WAVESPEED_API_KEY` through the existing environment/settings priority rules. These keys are not read at import time, are not logged, and must never enter `schemaSnapshot` or `project.json`.

The new Provider Asset Upload Router is backend infrastructure only:

- KIE inputs prefer the KIE CDN uploader for local files, data URIs, and raw base64.
- FAL inputs prefer the FAL CDN uploader for local files, data URIs, and raw base64.
- WaveSpeed keeps public HTTPS URLs as URLs and otherwise prefers WaveSpeed media upload for local files, data URIs, and raw base64. Inputs larger than 300MB use the existing Public Asset Service fallback or require a public URL. `preferred_upload="base64"` can keep image data URIs/base64 inline when allowed.
- Seedance public asset handling remains owned by the existing Seedance provider path, preserving its R2/TOS/public URL behavior from Phase 5.4.

Google Veo 3 and Veo 3.1 are explicitly not routed through KIE, FAL, or WaveSpeed. The project already has Google Official and Yunwu Veo channels; duplicating those models through third-party platforms would make capability selection and UI behavior ambiguous.

Planned follow-up phases:

- Phase 6.1: KIE Adapter with selected non-Google video models.
- Phase 6.2: FAL Adapter with selected models.
- Phase 6.3: WaveSpeed Adapter with selected models.
- Phase 7: Experimental remote discovery.

## Phase 6.1C KIE Video Whitelist

Phase 6.1C expands the KIE video provider through `adapterHints.adapterId = "kie:wan"` and `adapterHints.runtime = "adapter"`. This phase is mock-only: Phase 6.1B real API smoke was skipped intentionally, no real KIE API is called, and no real assets are uploaded.

The only exposed KIE models are:

- `wan/2-7-text-to-video`
- `wan/2-7-image-to-video`
- `kling-3.0/video/text-to-video`
- `kling-3.0/video/image-to-video`
- `kling-2.6/text-to-video`
- `kling-2.6/image-to-video`
- `bytedance/seedance-2/text-to-video`
- `bytedance/seedance-2/image-to-video`
- `bytedance/seedance-2-fast/text-to-video`
- `bytedance/seedance-2-fast/image-to-video`

KIE full model discovery is not enabled. Google Veo 3, Veo 3.1, Imagen, Nano Banana, GPT Image, Wan image generation, and Gemini Omni Video entries exposed by third-party KIE catalogs are intentionally not registered through KIE.

KIE text-to-video entries accept `text:prompt` and emit `video:out`. KIE image-to-video entries accept optional `text:prompt`, require `image:firstFrame`, and emit `video:out`. Image-to-video first-frame inputs are resolved through `ProviderAssetUploadRouter(provider="kie")` before payload construction.

KIE media upload supports Base64 (`/api/file-base64-upload`), URL (`/api/file-url-upload`), and stream (`/api/file-stream-upload`) routes. Stream upload uses multipart/form-data with `file`, `uploadPath`, and `fileName`.

The current KIE payload builder uses `ratio` for text-to-video aspect ratio and `first_frame_url` for image-to-video. These fields are centralized in the KIE payload builder because KIE official documentation and node-banana/Redpanda-style examples may still differ before real smoke testing. Kling and Seedance through KIE are intentionally isolated from the official Kling and Seedance runtimes.

KIE query parsing supports stringified `data.resultJson` plus fallback fields such as `data.videoUrl`, `data.video_url`, `data.output`, `data.imageUrl`, `data.image_url`, and `data.url`. Successful remote URLs still flow into the existing local video download/persistence path; the project does not rely on KIE remote URLs as permanent outputs.

Phase 6.1C does not modify VideoNode UI, project save structure, existing Yunwu/Google/Kling/Yunwu-Kling/Seedance runtimes, FAL, WaveSpeed, or remote model discovery. Gemini Omni Video is deferred to Phase 6.1D pending exact KIE model id, payload, and query response confirmation. Image models are deferred to later image-provider work.

## Phase 6.2 KIE Image Provider

Phase 6.2 is separate from the video capability schema. It adds mock-only KIE image-provider entries for `nano-banana-pro`, `nano-banana-2`, `gpt-image-2-text-to-image`, and `gpt-image-2-image-to-image` with `(KIE)` display names.

This phase does not add new video capabilities, does not modify VideoNode UI, and does not change existing video provider runtimes. GPT Image 2 image-to-image is registered as mock-only based on KIE docs and uses `input_urls`; Nano Banana image-to-image keeps `image_input`. Real API smoke remains deferred.
