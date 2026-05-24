const VIDEO_MODE_IDS = ['text-to-video', 'image-to-video', 'reference-video'];

const COMMON_SEED_PARAM = {
  type: 'number',
  label: 'Seed',
  min: -1,
  max: 99999999,
  default: -1,
};

const YUNWU_VEO_PARAMS = {
  videoMode: {
    type: 'select',
    label: 'Video Mode',
    options: ['text-to-video', 'image-to-video'],
    default: 'text-to-video',
  },
  aspectRatio: {
    type: 'select',
    label: 'Aspect Ratio',
    options: ['16:9', '9:16'],
    default: '16:9',
  },
  enableUpsample: {
    type: 'boolean',
    label: 'Upsample',
    default: false,
  },
  seed: COMMON_SEED_PARAM,
};

const GOOGLE_VEO_PARAMS = {
  videoMode: {
    type: 'select',
    label: 'Video Mode',
    options: VIDEO_MODE_IDS,
    default: 'text-to-video',
  },
  aspectRatio: {
    type: 'select',
    label: 'Aspect Ratio',
    options: ['16:9', '9:16'],
    default: '16:9',
  },
  duration: {
    type: 'select',
    label: 'Duration',
    options: ['4s', '6s', '8s'],
    default: '8s',
  },
  durationSeconds: {
    type: 'number',
    label: 'Duration Seconds',
    min: 4,
    max: 8,
    default: 8,
  },
  resolution: {
    type: 'select',
    label: 'Resolution',
    options: ['720p', '1080p'],
    default: '720p',
  },
  generateAudio: {
    type: 'boolean',
    label: 'Generate Audio',
    default: true,
  },
  seed: COMMON_SEED_PARAM,
  numberOfVideos: {
    type: 'number',
    label: 'Videos',
    min: 1,
    max: 4,
    default: 1,
  },
};

const KLING_STANDARD_DURATION_OPTIONS = ['5s', '10s'];
const KLING_EXTENDED_DURATION_OPTIONS = [
  '3s',
  '4s',
  '5s',
  '6s',
  '7s',
  '8s',
  '9s',
  '10s',
  '11s',
  '12s',
  '13s',
  '14s',
  '15s',
];

const getKlingParams = (videoModes, durationOptions) => ({
  videoMode: {
    type: 'select',
    label: 'Video Mode',
    options: videoModes,
    default: videoModes[0],
  },
  aspectRatio: {
    type: 'select',
    label: 'Aspect Ratio',
    options: ['16:9', '9:16', '1:1'],
    default: '16:9',
  },
  duration: {
    type: 'select',
    label: 'Duration',
    options: durationOptions,
    default: '5s',
  },
  qualityMode: {
    type: 'select',
    label: 'Quality',
    options: ['std', 'pro'],
    default: 'std',
  },
  generateAudio: {
    type: 'boolean',
    label: 'Sound',
    default: false,
  },
  seed: COMMON_SEED_PARAM,
});

const KLING_V3_PARAMS = {
  ...getKlingParams(['text-to-video', 'image-to-video'], KLING_EXTENDED_DURATION_OPTIONS),
  shotMode: {
    type: 'select',
    label: 'Shot Mode',
    options: ['single', 'intelligence', 'customize'],
    default: 'single',
    customParamPath: ['kling', 'shotMode'],
  },
  cfgScale: {
    type: 'number',
    label: 'CFG Scale',
    min: 0,
    max: 1,
    step: 0.05,
    default: 0.5,
    customParamPath: ['kling', 'cfgScale'],
    control: 'slider',
  },
};

const createKlingProvider = (id, label) => {
  const standardModes = ['text-to-video', 'image-to-video'];
  const omniModes = ['omni-video'];
  const quickParams = ['videoMode', 'aspectRatio', 'duration', 'qualityMode'];
  const omniQuickParams = ['aspectRatio', 'duration', 'qualityMode'];

  return {
    id,
    label,
    models: [
      {
        id: 'kling-v2-6',
        label: 'Kling V2.6',
        family: 'kling',
        adapterKey: id,
        supportedModes: standardModes,
        inputCapabilities: {
          text: true,
          images: true,
          endFrame: false,
          endFrameByQualityMode: {
            std: false,
            pro: true,
          },
          referenceImages: false,
          maxImages: 1,
          maxInputImageSizeMb: 10,
        },
        quickParams,
        params: getKlingParams(standardModes, KLING_STANDARD_DURATION_OPTIONS),
        customParams: {},
      },
      {
        id: 'kling-v3',
        label: 'Kling V3',
        family: 'kling',
        adapterKey: id,
        supportedModes: standardModes,
        inputCapabilities: {
          text: true,
          images: true,
          endFrame: true,
          endFrameByQualityMode: {
            std: true,
            pro: true,
          },
          referenceImages: false,
          maxImages: 1,
          maxInputImageSizeMb: 10,
        },
        capabilities: {
          cfgScale: true,
          multiShot: {
            supported: true,
            modes: ['text-to-video', 'image-to-video'],
            shotTypes: ['intelligence', 'customize'],
            maxShots: 6,
            promptMaxLength: 512,
            durationRange: [3, 15],
          },
          cameraControl: {
            supported: true,
            modes: ['text-to-video', 'image-to-video'],
            presets: ['down_back', 'forward_up', 'right_turn_forward', 'left_turn_forward'],
            simpleAxes: ['horizontal', 'vertical', 'pan', 'tilt', 'roll', 'zoom'],
            valueRange: [-10, 10],
            incompatibleWith: ['endImage'],
          },
        },
        quickParams,
        params: KLING_V3_PARAMS,
        customParams: {
          kling: {
            shotMode: 'single',
            cfgScale: 0.5,
            cameraControl: {
              type: 'none',
              axis: 'pan',
              value: 0,
            },
          },
        },
      },
      {
        id: 'kling-v3-omni',
        label: 'Kling V3 Omni',
        family: 'kling',
        adapterKey: id,
        supportedModes: omniModes,
        inputCapabilities: {
          text: false,
          images: true,
          endFrame: false,
          referenceImages: true,
          maxImages: 7,
          maxReferenceImages: 7,
          maxInputImageSizeMb: 10,
        },
        capabilities: {
          omniComposer: {
            supported: true,
            maxImages: 7,
            maxElements: 3,
            imageRoles: ['reference', 'first_frame', 'end_frame'],
          },
        },
        quickParams: omniQuickParams,
        params: getKlingParams(omniModes, KLING_EXTENDED_DURATION_OPTIONS),
        customParams: {
          kling: {},
        },
      },
    ],
  };
};

export const VIDEO_GENERATION_REGISTRY = {
  providers: [
    {
      id: 'yunwu',
      label: 'Yunwu',
      models: [
        {
          id: 'veo3.1',
          label: 'Veo 3.1',
          family: 'veo',
          adapterKey: 'yunwu_veo',
          supportedModes: ['text-to-video', 'image-to-video'],
          inputCapabilities: {
            text: true,
            images: true,
            endFrame: true,
            referenceImages: false,
            maxImages: 1,
          },
          quickParams: ['videoMode', 'aspectRatio', 'enableUpsample'],
          params: YUNWU_VEO_PARAMS,
          customParams: {},
        },
        {
          id: 'veo3.1-fast',
          label: 'Veo 3.1 Fast',
          family: 'veo',
          adapterKey: 'yunwu_veo',
          supportedModes: ['text-to-video', 'image-to-video'],
          inputCapabilities: {
            text: true,
            images: true,
            endFrame: true,
            referenceImages: false,
            maxImages: 1,
          },
          quickParams: ['videoMode', 'aspectRatio', 'enableUpsample'],
          params: YUNWU_VEO_PARAMS,
          customParams: {},
        },
        {
          id: 'veo3.1-components',
          label: 'Veo 3.1 Components',
          family: 'veo',
          adapterKey: 'yunwu_veo_components',
          supportedModes: ['reference-video'],
          inputCapabilities: {
            text: true,
            images: true,
            endFrame: false,
            referenceImages: true,
            maxImages: 3,
          },
          quickParams: ['videoMode', 'aspectRatio', 'enableUpsample'],
          params: {
            videoMode: {
              type: 'select',
              label: 'Video Mode',
              options: ['reference-video'],
              default: 'reference-video',
            },
            aspectRatio: {
              type: 'select',
              label: 'Aspect Ratio',
              options: ['16:9', '9:16'],
              default: '16:9',
            },
            enableUpsample: {
              type: 'boolean',
              label: 'Upsample',
              default: false,
            },
            veoFlClose: {
              type: 'boolean',
              label: 'Veo FL Close',
              default: true,
            },
            seed: COMMON_SEED_PARAM,
          },
          customParams: {
            veoFlClose: true,
          },
        },
      ],
    },
    {
      id: 'google',
      label: 'Google',
      models: [
        {
          id: 'veo-3.1-generate-001',
          label: 'Veo 3.1',
          family: 'veo',
          adapterKey: 'google_veo',
          supportedModes: VIDEO_MODE_IDS,
          inputCapabilities: {
            text: true,
            images: true,
            endFrame: true,
            referenceImages: true,
            maxImages: 1,
            maxReferenceImages: 4,
            maxInputImageSizeMb: 20,
          },
          quickParams: ['videoMode', 'aspectRatio', 'duration', 'resolution'],
          params: GOOGLE_VEO_PARAMS,
          constraints: {
            durationByResolution: {
              '1080p': '8s',
            },
            durationByMode: {
              'reference-video': '8s',
            },
          },
          customParams: {},
        },
        {
          id: 'veo-3.1-fast-generate-001',
          label: 'Veo 3.1 Fast',
          family: 'veo',
          adapterKey: 'google_veo_fast',
          supportedModes: VIDEO_MODE_IDS,
          inputCapabilities: {
            text: true,
            images: true,
            endFrame: true,
            referenceImages: true,
            maxImages: 1,
            maxReferenceImages: 4,
            maxInputImageSizeMb: 20,
          },
          quickParams: ['videoMode', 'aspectRatio', 'duration', 'resolution'],
          params: GOOGLE_VEO_PARAMS,
          constraints: {
            durationByResolution: {
              '1080p': '8s',
            },
            durationByMode: {
              'reference-video': '8s',
            },
          },
          customParams: {},
        },
        {
          id: 'veo-3.1-lite-generate-001',
          label: 'Veo 3.1 Lite',
          family: 'veo',
          adapterKey: 'google_veo_lite',
          supportedModes: ['text-to-video', 'image-to-video'],
          inputCapabilities: {
            text: true,
            images: true,
            endFrame: true,
            referenceImages: false,
            maxImages: 1,
            maxReferenceImages: 0,
            maxInputImageSizeMb: 20,
          },
          quickParams: ['videoMode', 'aspectRatio', 'duration', 'resolution'],
          params: {
            ...GOOGLE_VEO_PARAMS,
            videoMode: {
              type: 'select',
              label: 'Video Mode',
              options: ['text-to-video', 'image-to-video'],
              default: 'text-to-video',
            },
          },
          constraints: {
            durationByResolution: {
              '1080p': '8s',
            },
          },
          customParams: {},
        },
      ],
    },
    createKlingProvider('kling', 'Kling'),
    createKlingProvider('yunwu-kling', 'Yunwu Kling'),
  ],
};

export const VIDEO_MODE_OPTIONS = [
  { id: 'text-to-video', label: 'Text to Video', shortLabel: 'T2V' },
  { id: 'image-to-video', label: 'Image to Video', shortLabel: 'I2V' },
  { id: 'reference-video', label: 'Reference Video', shortLabel: 'REF' },
];

export const DEFAULT_VIDEO_GENERATION_SETTINGS = {
  provider: 'yunwu',
  model: 'veo3.1-fast',
  videoMode: 'text-to-video',
  prompt: '',
  negativePrompt: '',
  aspectRatio: '16:9',
  duration: '8s',
  durationSeconds: 8,
  resolution: '720p',
  qualityMode: 'std',
  seed: -1,
  numberOfVideos: 1,
  generateAudio: false,
  enhancePrompt: true,
  autoFix: false,
  cameraMotion: 'static',
  motionStrength: 5,
  cfgScale: 7,
  fps: 25,
  enableUpsample: false,
  customParams: {},
  task: {
    id: '',
    status: 'idle',
    progress: 0,
    message: '',
    providerTaskId: '',
    statusUrl: '',
    responseUrl: '',
    cancelUrl: '',
    queuePosition: 0,
  },
  outputs: {
    videoUrl: '',
    coverUrl: '',
    previewFrames: [],
  },
};

const VIDEO_ACTIVE_TASK_STATUSES = new Set([
  'submitting',
  'queued',
  'running',
  'processing',
  'pending',
  'submitted',
]);

export const isVideoTaskActive = (status) => VIDEO_ACTIVE_TASK_STATUSES.has(String(status || '').toLowerCase());

export const resolveKlingOmniElements = (omniParamsOutput) => {
  const omniElements = Array.isArray(omniParamsOutput?.elements) ? omniParamsOutput.elements : [];
  return omniElements;
};

export const fetchVideoGenerationRegistry = async () => {
  const response = await fetch('http://127.0.0.1:8000/api/video/specs');
  const registry = await response.json();
  if (!response.ok) {
    throw new Error(registry?.detail || `Video specs fetch failed: ${response.status}`);
  }
  return registry;
};

const resolveVideoGenerationRegistry = (registry) =>
  registry?.providers?.length ? registry : VIDEO_GENERATION_REGISTRY;

const parseDurationSeconds = (value) => {
  const number = Number(String(value || '').replace(/s$/i, ''));
  return Number.isFinite(number) ? number : DEFAULT_VIDEO_GENERATION_SETTINGS.durationSeconds;
};

const getDefaultProvider = (registry) => {
  const activeRegistry = resolveVideoGenerationRegistry(registry);
  return (
    activeRegistry.providers.find((provider) => provider.id === DEFAULT_VIDEO_GENERATION_SETTINGS.provider) ||
    activeRegistry.providers[0]
  );
};

export const getVideoProvider = (providerId, registry) => {
  const activeRegistry = resolveVideoGenerationRegistry(registry);
  return activeRegistry.providers.find((provider) => provider.id === providerId) || getDefaultProvider(activeRegistry);
};

export const getVideoModel = (providerId, modelId, registry) => {
  const provider = getVideoProvider(providerId, registry);
  return (
    provider?.models?.find((model) => model.id === modelId) ||
    provider?.models?.find((model) => model.id === DEFAULT_VIDEO_GENERATION_SETTINGS.model) ||
    provider?.models?.[0] ||
    null
  );
};

export const getVideoModelConfig = (providerId, modelId, registry) => getVideoModel(providerId, modelId, registry);

const getParamDefault = (paramConfig) => {
  if (!paramConfig) return undefined;
  if (paramConfig.default !== undefined) return paramConfig.default;
  if (paramConfig.type === 'boolean') return false;
  return paramConfig.options?.[0];
};

const normalizeSelectValue = (key, value) => {
  if (key !== 'qualityMode') return value;
  if (value === 'standard') return 'std';
  if (value === 'high') return 'pro';
  return value;
};

const applyModelConstraints = (settings, modelConfig) => {
  const nextSettings = { ...settings };
  const durationByMode = modelConfig?.constraints?.durationByMode || {};
  const durationByResolution = modelConfig?.constraints?.durationByResolution || {};

  if (durationByMode[nextSettings.videoMode]) {
    nextSettings.duration = durationByMode[nextSettings.videoMode];
  }
  if (durationByResolution[nextSettings.resolution]) {
    nextSettings.duration = durationByResolution[nextSettings.resolution];
  }

  nextSettings.durationSeconds = parseDurationSeconds(nextSettings.duration);
  return nextSettings;
};

export const normalizeVideoGenerationSettings = (settings = {}, registry) => {
  const provider = getVideoProvider(settings.provider, registry);
  const model = getVideoModel(provider?.id, settings.model, registry);
  const params = model?.params || {};
  const nextSettings = {
    ...DEFAULT_VIDEO_GENERATION_SETTINGS,
    ...settings,
    provider: provider?.id || DEFAULT_VIDEO_GENERATION_SETTINGS.provider,
    model: model?.id || DEFAULT_VIDEO_GENERATION_SETTINGS.model,
    customParams: {
      ...(model?.customParams || {}),
      ...(settings.customParams || {}),
    },
    task: {
      ...DEFAULT_VIDEO_GENERATION_SETTINGS.task,
      ...(settings.task || {}),
    },
    outputs: {
      ...DEFAULT_VIDEO_GENERATION_SETTINGS.outputs,
      ...(settings.outputs || {}),
    },
  };

  Object.entries(params).forEach(([key, config]) => {
    const current = settings[key];
    const normalizedCurrent = normalizeSelectValue(key, current);
    const fallback = getParamDefault(config);
    if (config.type === 'select') {
      nextSettings[key] = config.options?.includes(normalizedCurrent) ? normalizedCurrent : fallback;
      return;
    }
    if (config.type === 'boolean') {
      nextSettings[key] = typeof current === 'boolean' ? current : fallback;
      return;
    }
    if (config.type === 'number') {
      const number = Number(current);
      const defaultValue = Number(fallback);
      const min = config.min ?? Number.NEGATIVE_INFINITY;
      const max = config.max ?? Number.POSITIVE_INFINITY;
      const safeNumber = Number.isFinite(number) ? number : defaultValue;
      nextSettings[key] = Math.min(Math.max(safeNumber, min), max);
    }
  });

  const modeParam = params.videoMode;
  const supportedModes = model?.supportedModes || modeParam?.options || [DEFAULT_VIDEO_GENERATION_SETTINGS.videoMode];
  if (!supportedModes.includes(nextSettings.videoMode)) {
    nextSettings.videoMode = supportedModes.includes(modeParam?.default)
      ? modeParam.default
      : supportedModes[0] || DEFAULT_VIDEO_GENERATION_SETTINGS.videoMode;
  }

  nextSettings.durationSeconds = parseDurationSeconds(nextSettings.duration);
  return applyModelConstraints(nextSettings, model);
};

export const supportsVideoEndFrame = (modelConfig, settings = {}) => {
  if (settings.videoMode !== 'image-to-video') return false;

  const modelId = modelConfig?.id || settings.model;
  const qualityMode = normalizeSelectValue('qualityMode', String(settings.qualityMode || '').toLowerCase());
  const inputCapabilities = modelConfig?.inputCapabilities || {};

  if (modelConfig?.family === 'kling' || ['kling-v2-6', 'kling-v3', 'kling-v3-omni'].includes(modelId)) {
    if (modelId === 'kling-v3-omni') return true;
    if (modelId === 'kling-v3') return true;
    if (modelId === 'kling-v2-6') return qualityMode === 'pro';
  }

  return Boolean(inputCapabilities.endFrame);
};

export const getKlingShotMode = (settings = {}) => {
  const raw = settings.customParams?.kling?.shotMode || settings.shotMode || 'single';
  return ['single', 'intelligence', 'customize'].includes(raw) ? raw : 'single';
};

export const supportsKlingMultiShot = (modelConfig) =>
  Boolean(modelConfig?.capabilities?.multiShot?.supported);

export const supportsKlingCameraControl = (modelConfig) =>
  Boolean(modelConfig?.capabilities?.cameraControl?.supported);

export const isKlingOmniModel = (settingsOrModelConfig = {}) => {
  const modelId = settingsOrModelConfig?.id || settingsOrModelConfig?.model;
  const family = settingsOrModelConfig?.family;
  return modelId === 'kling-v3-omni' && (!family || family === 'kling');
};

export const getActiveVideoHandlesForMode = (mode, modelConfig, settings = {}) => {
  if (isKlingOmniModel(modelConfig) || isKlingOmniModel(settings)) {
    return ['omniParams:in'];
  }
  const nextSettings = { ...settings, videoMode: mode };
  const shotMode = supportsKlingMultiShot(modelConfig) ? getKlingShotMode(nextSettings) : 'single';
  const promptHandle = shotMode === 'customize' ? 'multiPrompt:in' : 'text:prompt';
  if (mode === 'image-to-video') {
    const handles = [promptHandle, 'image:images'];
    if (supportsVideoEndFrame(modelConfig, nextSettings)) handles.push('image:end');
    return handles;
  }
  if (mode === 'reference-video') return [promptHandle, 'image:images'];
  return [promptHandle];
};

const getModeShortLabel = (mode) => VIDEO_MODE_OPTIONS.find((option) => option.id === mode)?.shortLabel || mode;

export const buildVideoQuickParamLabel = (settings = {}, modelConfig) => {
  const quickParams = modelConfig?.quickParams || [];
  return quickParams
    .map((key) => (key === 'videoMode' ? getModeShortLabel(settings[key]) : settings[key]))
    .filter((value) => value !== undefined && value !== null && value !== '')
    .join(' · ');
};
