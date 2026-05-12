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

const normalizeRegistry = (registry) => {
  if (!registry?.providers || !registry?.models) return DEFAULT_IMAGE_GENERATION_REGISTRY;
  return registry;
};

const toOption = (id) => ({ id, label: id });

export const getImageProviderOptions = (registry) =>
  Object.keys(normalizeRegistry(registry).providers).map(toOption);

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
  const model = modelIds.includes(modelId) ? modelId : modelIds[0];
  const config = safeRegistry.models[model] || {};
  return model
    ? {
        id: model,
        label: model,
        ...config,
      }
    : null;
};

export const getImageAspectRatioOptions = (providerId, modelId, registry) =>
  (getImageModelConfig(providerId, modelId, registry)?.ratios || ['1:1']).map(toOption);

export const getImageResolutionOptions = (providerId, modelId, registry) =>
  (getImageModelConfig(providerId, modelId, registry)?.resolutions || ['1K']).map(toOption);

export const getDefaultImageGenerationSettings = (registry) =>
  normalizeImageGenerationSettings(DEFAULT_IMAGE_GENERATION_SETTINGS, registry);

export const normalizeImageGenerationSettings = (settings = {}, registry) => {
  const safeRegistry = normalizeRegistry(registry);
  const defaultProvider = DEFAULT_IMAGE_GENERATION_SETTINGS.provider;
  const provider = safeRegistry.providers[settings.provider]
    ? settings.provider
    : safeRegistry.providers[defaultProvider]
      ? defaultProvider
      : Object.keys(safeRegistry.providers)[0];
  const models = safeRegistry.providers[provider] || [];
  const model = models.includes(settings.model)
    ? settings.model
    : models.includes(DEFAULT_IMAGE_GENERATION_SETTINGS.model)
      ? DEFAULT_IMAGE_GENERATION_SETTINGS.model
      : models[0];
  const modelConfig = safeRegistry.models[model] || {};
  const aspectRatios = modelConfig.ratios || ['1:1'];
  const rawAspectRatio = settings.aspectRatio || settings.ratio;
  const aspectRatio = aspectRatios.includes(rawAspectRatio)
    ? rawAspectRatio
    : aspectRatios.includes(DEFAULT_IMAGE_GENERATION_SETTINGS.aspectRatio)
      ? DEFAULT_IMAGE_GENERATION_SETTINGS.aspectRatio
      : aspectRatios[0];
  const resolutions = modelConfig.resolutions || ['1K'];
  const resolution = resolutions.includes(settings.resolution)
    ? settings.resolution
    : resolutions.includes(DEFAULT_IMAGE_GENERATION_SETTINGS.resolution)
      ? DEFAULT_IMAGE_GENERATION_SETTINGS.resolution
      : resolutions[0];

  return {
    ...settings,
    provider,
    model,
    aspectRatio,
    ratio: aspectRatio,
    resolution,
  };
};

export const fetchImageGenerationRegistry = async () => {
  const response = await fetch('http://127.0.0.1:8000/api/model-specs');
  if (!response.ok) {
    throw new Error(`Failed to load image generation options: ${response.status}`);
  }
  return response.json();
};
