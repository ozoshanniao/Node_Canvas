export const DEFAULT_IMAGE_GENERATION_REGISTRY = {
  providers: {
    Google: ['Nano Pro', 'Nano 2'],
    Yunwu: ['Nano pro', 'Nano 2', 'GPT-2'],
  },
  models: {
    'Nano Pro': {
      ratios: ['1:1', '3:2', '2:3', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'],
      resolutions: ['1K', '2K', '4K'],
      output_format: ['png', 'jpeg'],
      features: ['google_search'],
      supports_reference: true,
    },
    'Nano pro': {
      ratios: ['1:1', '3:2', '2:3', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'],
      resolutions: ['1K', '2K', '4K'],
      output_format: ['png', 'jpeg'],
      features: ['google_search'],
      supports_reference: true,
    },
    'Nano 2': {
      ratios: ['1:1', '3:2', '2:3', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '1:4', '4:1', '1:8', '8:1', '21:9'],
      resolutions: ['1K', '2K', '4K'],
      output_format: ['png', 'jpeg'],
      features: ['google_search'],
      supports_reference: true,
    },
    'GPT-2': {
      ratios: ['auto', '1:1', '3:2', '2:3', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'],
      resolutions: ['1K', '2K', '4K'],
      output_format: ['png', 'jpeg', 'webp'],
      quality: ['auto', 'low', 'medium', 'high'],
      n: {
        type: 'slider',
        min: 1,
        max: 10,
        step: 1,
        default: 1,
        label: 'Batch Size',
      },
      supports_reference: true,
    },
  },
};

export const DEFAULT_IMAGE_GENERATION_SETTINGS = {
  provider: 'Yunwu',
  model: 'Nano 2',
  aspectRatio: '1:1',
  ratio: '1:1',
  resolution: '1K',
};

export const KIE_IMAGE_MODEL_MIGRATIONS = {
  'gpt-image-2-text-to-image': 'gpt-image-2',
  'gpt-image-2-image-to-image': 'gpt-image-2',
  'GPT Image 2 I2I (KIE)': 'gpt-image-2',
  'GPT Image 2 (KIE)': 'gpt-image-2',
};

const normalizeImageModelId = (provider, model) => {
  if (provider !== 'KIE') return model;
  return KIE_IMAGE_MODEL_MIGRATIONS[model] || model;
};

const resolveImageModelId = (safeRegistry, provider, model) => {
  const normalizedModelId = normalizeImageModelId(provider, model);
  const modelIds = safeRegistry.providers[provider] || [];
  if (modelIds.includes(normalizedModelId)) return normalizedModelId;
  const matchedBySpecId = modelIds.find((modelId) => safeRegistry.models[modelId]?.id === normalizedModelId);
  return matchedBySpecId || normalizedModelId;
};

const normalizeRegistry = (registry) => {
  if (!registry?.providers || !registry?.models) return DEFAULT_IMAGE_GENERATION_REGISTRY;
  return registry;
};

const getImageProviderDisplayLabel = (providerId) => (providerId === 'Google' ? 'Google Cloud' : providerId);

const toOption = (id) => ({ id, label: id });
const toProviderOption = (id) => ({ id, label: getImageProviderDisplayLabel(id) });

const MODEL_METADATA_KEYS = new Set([
  'id',
  'label',
  'ratios',
  'resolutions',
  'output_format',
  'features',
  'supports_reference',
  'constraints',
  'taskTypes',
  'internalImageInputField',
  'maxImages',
  'promptMaxLength',
]);

const isExtraParamConfig = (key, value) => {
  if (key === 'quality' && Array.isArray(value)) return true;
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && 'default' in value);
};

export const getImageProviderOptions = (registry) =>
  Object.keys(normalizeRegistry(registry).providers).map(toProviderOption);

export const getImageProviderConfig = (providerId, registry) => {
  const safeRegistry = normalizeRegistry(registry);
  const provider = safeRegistry.providers[providerId] ? providerId : Object.keys(safeRegistry.providers)[0];
  return provider
    ? {
        id: provider,
        label: provider,
        models: safeRegistry.providers[provider] || [],
      }
    : null;
};

export const getImageModelOptions = (providerId, registry) =>
  (getImageProviderConfig(providerId, registry)?.models || []).map(toOption);

export const getImageModelConfig = (providerId, modelId, registry) => {
  const safeRegistry = normalizeRegistry(registry);
  const modelIds = getImageProviderConfig(providerId, safeRegistry)?.models || [];
  const resolvedModelId = resolveImageModelId(safeRegistry, providerId, modelId);
  const model = modelIds.includes(resolvedModelId) ? resolvedModelId : modelIds[0];
  const config = safeRegistry.models[model] || {};
  return model
    ? {
        id: model,
        label: model,
        ...config,
      }
    : null;
};

const getImageExtraParamDefaults = (modelConfig = {}) =>
  Object.entries(modelConfig).reduce((defaults, [key, value]) => {
    if (MODEL_METADATA_KEYS.has(key) || !isExtraParamConfig(key, value)) return defaults;
    if (Array.isArray(value)) {
      defaults[key] = value[0];
      return defaults;
    }
    defaults[key] = value.default;
    return defaults;
  }, {});

const getKnownImageExtraParamKeys = (registry) => {
  const safeRegistry = normalizeRegistry(registry);
  const keys = new Set();
  Object.values(safeRegistry.models || {}).forEach((modelConfig) => {
    Object.entries(modelConfig || {}).forEach(([key, value]) => {
      if (!MODEL_METADATA_KEYS.has(key) && isExtraParamConfig(key, value)) {
        keys.add(key);
      }
    });
  });
  return [...keys];
};

export const getImageAspectRatioOptions = (providerId, modelId, registry) =>
  (getImageModelConfig(providerId, modelId, registry)?.ratios || ['1:1']).map(toOption);

export const getImageResolutionOptions = (providerId, modelId, registry, settings = {}) => {
  const modelConfig = getImageModelConfig(providerId, modelId, registry);
  const resolutions = getConstrainedImageResolutions(modelConfig, settings);
  return resolutions.map(toOption);
};

export const getConstrainedImageResolutions = (modelConfig = {}, settings = {}) => {
  const resolutions = modelConfig.resolutions || ['1K'];
  const constraints = modelConfig.constraints || {};
  const aspectRatio = settings.aspectRatio || settings.ratio;
  if (aspectRatio === 'auto' && constraints.autoAspectRatioResolution) {
    return resolutions.filter((resolution) => resolution === constraints.autoAspectRatioResolution);
  }
  const squareDisallowed = aspectRatio === '1:1' ? constraints.squareAspectRatioDisallows || [] : [];
  return resolutions.filter((resolution) => !squareDisallowed.includes(resolution));
};

export const applyImageGenerationConstraints = (settings = {}, modelConfig = {}) => {
  const constraints = modelConfig.constraints || {};
  const nextSettings = { ...settings };
  if (nextSettings.aspectRatio === 'auto' && constraints.autoAspectRatioResolution) {
    nextSettings.resolution = constraints.autoAspectRatioResolution;
  }
  if (nextSettings.aspectRatio === '1:1' && (constraints.squareAspectRatioDisallows || []).includes(nextSettings.resolution)) {
    const fallback = getConstrainedImageResolutions(modelConfig, nextSettings)[0] || modelConfig.resolutions?.[0] || '1K';
    nextSettings.resolution = fallback;
  }
  if (nextSettings.resolution === '4K' && nextSettings.aspectRatio === '1:1' && (constraints.squareAspectRatioDisallows || []).includes('4K')) {
    nextSettings.aspectRatio = (modelConfig.ratios || []).find((ratio) => ratio !== '1:1' && ratio !== 'auto') || modelConfig.ratios?.[0] || '1:1';
    nextSettings.ratio = nextSettings.aspectRatio;
  }
  return nextSettings;
};

export const getDefaultImageGenerationSettings = (registry) =>
  normalizeImageGenerationSettings(DEFAULT_IMAGE_GENERATION_SETTINGS, registry);

export const normalizeImageGenerationSettings = (settings = {}, registry) => {
  const safeRegistry = normalizeRegistry(registry);
  const sourceSettings = { ...settings };
  const defaultProvider = DEFAULT_IMAGE_GENERATION_SETTINGS.provider;
  const provider = safeRegistry.providers[sourceSettings.provider]
    ? sourceSettings.provider
    : safeRegistry.providers[defaultProvider]
      ? defaultProvider
      : Object.keys(safeRegistry.providers)[0];
  sourceSettings.model = resolveImageModelId(safeRegistry, provider, sourceSettings.model);
  const models = safeRegistry.providers[provider] || [];
  const model = models.includes(sourceSettings.model)
    ? sourceSettings.model
    : models.includes(DEFAULT_IMAGE_GENERATION_SETTINGS.model)
      ? DEFAULT_IMAGE_GENERATION_SETTINGS.model
      : models[0];
  const modelConfig = safeRegistry.models[model] || {};
  const aspectRatios = modelConfig.ratios || ['1:1'];
  const rawAspectRatio = sourceSettings.aspectRatio || sourceSettings.ratio;
  const aspectRatio = aspectRatios.includes(rawAspectRatio)
    ? rawAspectRatio
    : aspectRatios.includes(DEFAULT_IMAGE_GENERATION_SETTINGS.aspectRatio)
      ? DEFAULT_IMAGE_GENERATION_SETTINGS.aspectRatio
      : aspectRatios[0];
  const resolutions = modelConfig.resolutions || ['1K'];
  const resolution = resolutions.includes(sourceSettings.resolution)
    ? sourceSettings.resolution
    : resolutions.includes(DEFAULT_IMAGE_GENERATION_SETTINGS.resolution)
      ? DEFAULT_IMAGE_GENERATION_SETTINGS.resolution
      : resolutions[0];

  return applyImageGenerationConstraints({
    ...sourceSettings,
    provider,
    model,
    aspectRatio,
    ratio: aspectRatio,
    resolution,
  }, modelConfig);
};

export const getImageModelSwitchPatch = (settings = {}, nextProvider, nextModel, registry) => {
  const normalized = normalizeImageGenerationSettings(
    {
      ...settings,
      provider: nextProvider,
      model: nextModel,
    },
    registry
  );
  const modelConfig = getImageModelConfig(normalized.provider, normalized.model, registry) || {};
  const extraDefaults = getImageExtraParamDefaults(modelConfig);
  const patch = {
    provider: normalized.provider,
    model: normalized.model,
    ratio: normalized.aspectRatio,
    aspectRatio: normalized.aspectRatio,
    resolution: normalized.resolution,
  };

  getKnownImageExtraParamKeys(registry).forEach((key) => {
    if (!(key in extraDefaults)) {
      patch[key] = undefined;
      return;
    }
    const current = settings[key];
    const config = modelConfig[key];
    if (Array.isArray(config)) {
      patch[key] = config.includes(current) ? current : extraDefaults[key];
      return;
    }
    if (config && typeof config === 'object' && config.type === 'slider') {
      const number = Number(current);
      const min = config.min ?? Number.NEGATIVE_INFINITY;
      const max = config.max ?? Number.POSITIVE_INFINITY;
      patch[key] = Number.isFinite(number) ? Math.min(Math.max(number, min), max) : extraDefaults[key];
      return;
    }
    patch[key] = current ?? extraDefaults[key];
  });

  return patch;
};

export const fetchImageGenerationRegistry = async () => {
  const response = await fetch('http://127.0.0.1:8000/api/model-specs');
  if (!response.ok) {
    throw new Error(`Failed to load image generation options: ${response.status}`);
  }
  return response.json();
};
