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
