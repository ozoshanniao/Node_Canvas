import { DEFAULT_VIDEO_GENERATION_SETTINGS } from './videoGenerationOptions.js';
import { buildVideoSchemaSnapshot } from './videoCapabilities.js';
import { sanitizePersistedKlingOmniReferences } from './klingOmniReferences.js';

export const VIDEO_PARAM_KEYS = [
  'prompt',
  'videoMode',
  'aspectRatio',
  'duration',
  'durationSeconds',
  'resolution',
  'qualityMode',
  'generateAudio',
  'returnLastFrame',
  'seed',
  'numberOfVideos',
  'negativePrompt',
  'enableUpsample',
  'enhancePrompt',
  'autoFix',
  'cameraMotion',
  'motionStrength',
  'cfgScale',
  'fps',
  'cameraControl',
  'multiShot',
  'serviceTier',
  'watermark',
];

export const pickLegacyVideoParams = (data = {}) =>
  VIDEO_PARAM_KEYS.reduce((params, key) => {
    if (data[key] !== undefined) params[key] = data[key];
    return params;
  }, {});

export const stripVideoParamRootFields = (data = {}) => {
  const stripped = { ...(data || {}) };
  VIDEO_PARAM_KEYS.forEach((key) => {
    delete stripped[key];
  });
  return stripped;
};

const TRANSIENT_KEYS = new Set([
  'task',
  'status',
  'error',
  'progress',
  'isGenerating',
  'isPolling',
  'loading',
  'pollingIntervalId',
  'abortController',
  'rawResponse',
  'rawCreateResponse',
  'rawQueryResponse',
  'adapterHints',
  'hiddenParams',
  'customParamsText',
]);

const SENSITIVE_KEY_PATTERN = /api[-_]?key|authorization|bearer|access[-_]?key|secret[-_]?key|private[-_]?key|token/i;
const RAW_KEY_PATTERN = /raw.*(schema|payload|response)|openapi/i;
const BASE64_PATTERN = /^data:(image|video|audio)\/[^;]+;base64,/i;
const BLOB_PATTERN = /^blob:/i;
const WINDOWS_ABSOLUTE_PATTERN = /^[a-zA-Z]:[\\/]/;
const UNIX_ABSOLUTE_PATTERN = /^\/(Users|home|var|tmp|etc|Volumes)\//;

export { buildVideoSchemaSnapshot };

const defaultParams = () =>
  VIDEO_PARAM_KEYS.reduce((params, key) => {
    if (Object.prototype.hasOwnProperty.call(DEFAULT_VIDEO_GENERATION_SETTINGS, key)) {
      params[key] = DEFAULT_VIDEO_GENERATION_SETTINGS[key];
    }
    return params;
  }, {});

export const createDefaultVideoNodeData = (capability = null) => ({
  provider: capability?.provider || DEFAULT_VIDEO_GENERATION_SETTINGS.provider,
  model: capability?.model || DEFAULT_VIDEO_GENERATION_SETTINGS.model,
  taskType: capability?.taskTypes?.[0] || DEFAULT_VIDEO_GENERATION_SETTINGS.videoMode,
  params: defaultParams(),
  schemaSnapshot: buildVideoSchemaSnapshot(capability),
  outputs: {},
});

const normalizeOutputs = (outputs = {}, data = {}) => {
  const normalized = {};
  const videoUrl = outputs.video?.url || outputs.videoUrl || data.videoUrl || data.localVideoUrl;
  const videoPath = outputs.video?.path || outputs.video?.filePath || data.outputVideoPath;
  if (videoUrl || videoPath) {
    normalized.video = {
      ...(videoPath ? { path: videoPath } : {}),
      ...(videoUrl ? { url: videoUrl } : {}),
      mimeType: outputs.video?.mimeType || 'video/mp4',
      ...(outputs.video?.createdAt ? { createdAt: outputs.video.createdAt } : {}),
    };
  }

  const lastFrame = outputs.lastFrame || data.lastFrame;
  if (lastFrame?.url || lastFrame?.path || lastFrame?.filePath) {
    normalized.lastFrame = {
      path: lastFrame.path || lastFrame.filePath,
      url: lastFrame.url,
      mimeType: lastFrame.mimeType || 'image/png',
      ...(lastFrame.createdAt ? { createdAt: lastFrame.createdAt } : {}),
    };
  }
  return normalized;
};

export const normalizeVideoNodeData = (data = {}, capability = null) => {
  const defaults = createDefaultVideoNodeData(capability);
  return {
    provider: data.provider || defaults.provider,
    model: data.model || defaults.model,
    taskType: data.taskType || data.videoMode || defaults.taskType,
    customParams: data.customParams,
    params: {
      ...defaults.params,
      ...pickLegacyVideoParams(data),
      ...(data.params || {}),
    },
    schemaSnapshot: data.schemaSnapshot || defaults.schemaSnapshot,
    outputs: normalizeOutputs(data.outputs || {}, data),
  };
};

export const updateVideoNodeParam = (data = {}, key, value) => ({
  ...normalizeVideoNodeData(data),
  params: {
    ...(normalizeVideoNodeData(data).params || {}),
    [key]: value,
  },
});

export const buildSyncedVideoParamsPatch = ({
  settings = {},
  nextSettings = {},
  modelConfig = {},
  fallbackParamKeys = VIDEO_PARAM_KEYS,
} = {}) => {
  const modelParamKeys = modelConfig?.params ? Object.keys(modelConfig.params) : [];
  const paramKeys = new Set([...modelParamKeys, ...fallbackParamKeys]);
  const nextParams = {
    ...(settings.params || {}),
    ...(nextSettings.params || {}),
  };
  const isGoogleOmni =
    (nextSettings.provider || settings.provider || modelConfig.adapterKey) === 'google_omni' &&
    (nextSettings.model || settings.model || modelConfig.id) === 'gemini-omni-flash-preview';

  paramKeys.forEach((key) => {
    if (nextSettings[key] !== undefined) {
      nextParams[key] = nextSettings[key];
    }
  });

  const patch = stripVideoParamRootFields(nextSettings);
  const videoMode = nextParams.videoMode || nextSettings.taskType || nextSettings.videoMode;
  const syncedParams = isGoogleOmni
    ? Object.fromEntries(
        Object.entries(nextParams).filter(([key]) => ['prompt', 'videoMode', 'aspectRatio', 'duration'].includes(key))
      )
    : nextParams;
  return {
    ...patch,
    ...(isGoogleOmni ? { customParams: undefined } : {}),
    ...(videoMode ? { taskType: videoMode } : {}),
    params: syncedParams,
  };
};

const isUnsafeString = (value) =>
  BASE64_PATTERN.test(value) ||
  BLOB_PATTERN.test(value) ||
  WINDOWS_ABSOLUTE_PATTERN.test(value) ||
  UNIX_ABSOLUTE_PATTERN.test(value);

const sanitizeValue = (value, key = '') => {
  if (value == null) return value;
  if (TRANSIENT_KEYS.has(key) || SENSITIVE_KEY_PATTERN.test(key) || RAW_KEY_PATTERN.test(key)) return undefined;
  if (typeof File !== 'undefined' && value instanceof File) return undefined;
  if (typeof Blob !== 'undefined' && value instanceof Blob) return undefined;
  if (value instanceof Error) return undefined;
  if (typeof value === 'string') return isUnsafeString(value) ? undefined : value;
  if (Array.isArray(value)) {
    const items = value.map((item) => sanitizeValue(item)).filter((item) => item !== undefined);
    return items;
  }
  if (typeof value === 'object') {
    const sanitized = {};
    Object.entries(value).forEach(([childKey, childValue]) => {
      const next = sanitizeValue(childValue, childKey);
      if (next !== undefined) sanitized[childKey] = next;
    });
    return sanitized;
  }
  return value;
};

export const sanitizeVideoNodeDataForSave = (data = {}, capability = null) => {
  const normalized = normalizeVideoNodeData(data, capability);
  let sanitizedParams = sanitizeValue(normalized.params) || {};
  const isGoogleOmni =
    normalized.provider === 'google_omni' && normalized.model === 'gemini-omni-flash-preview';
  if (isGoogleOmni) {
    sanitizedParams = Object.fromEntries(
      Object.entries(sanitizedParams).filter(([key]) => ['prompt', 'videoMode', 'aspectRatio', 'duration'].includes(key))
    );
  }
  if (sanitizedParams.customParams) {
    delete sanitizedParams.customParams;
  }
  const sanitizedCustomParams = sanitizeValue(normalized.customParams) || null;
  const sanitizedOutputs = sanitizeValue(normalized.outputs) || {};
  const snapshot = sanitizeValue(normalized.schemaSnapshot) || null;

  const sanitized = {
    provider: normalized.provider,
    model: normalized.model,
    taskType: normalized.taskType,
    params: sanitizedParams,
    schemaSnapshot: snapshot,
    outputs: sanitizedOutputs,
  };
  if (sanitizedCustomParams && !isGoogleOmni) {
    sanitized.customParams = sanitizePersistedKlingOmniReferences(sanitizedCustomParams);
  }
  return sanitized;
};
