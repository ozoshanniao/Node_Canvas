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
