export const LLM_PROVIDERS = [
  {
    id: 'Google',
    label: 'Google Cloud',
    models: [
      {
        id: 'gemini-3.1-flash-lite',
        label: 'Gemini 3.1 Flash',
        capabilities: {
          supportsImages: true,
          supportsThinking: true,
          supportsReasoningEffort: false,
          supportsStreaming: false,
          supportsLocalSoftSkills: false,
        },
      },
      {
        id: 'gemini-3.1-pro-preview',
        label: 'Gemini 3.1 Pro',
        capabilities: {
          supportsImages: true,
          supportsThinking: true,
          supportsReasoningEffort: false,
          supportsStreaming: false,
          supportsLocalSoftSkills: false,
        },
      },
    ],
    parameters: {
      thinkingLevel: {
        enabled: true,
        label: 'Thinking',
        default: 'medium',
        options: [
          { id: 'low', label: 'Low' },
          { id: 'medium', label: 'Medium' },
          { id: 'high', label: 'High' },
        ],
      },
      temperature: {
        enabled: true,
        label: 'Temperature',
        default: 0.85,
        min: 0,
        max: 2,
        step: 0.05,
      },
      maxTokens: {
        enabled: true,
        label: 'Max Tokens',
        default: 8192,
        min: 256,
        max: 65535,
        step: 256,
      },
    },
  },
  {
    id: 'Yunwu',
    label: 'Yunwu',
    models: [
      {
        id: 'gemini-3.1-flash-lite',
        label: 'Gemini 3.1 Flash',
        capabilities: {
          supportsImages: true,
          supportsThinking: false,
          supportsReasoningEffort: false,
          supportsStreaming: false,
          supportsLocalSoftSkills: false,
        },
      },
      {
        id: 'gemini-3.1-pro-preview',
        label: 'Gemini 3.1 Pro',
        capabilities: {
          supportsImages: true,
          supportsThinking: false,
          supportsReasoningEffort: false,
          supportsStreaming: false,
          supportsLocalSoftSkills: false,
        },
      },
      {
        id: 'gpt-5.4-mini',
        label: 'GPT 5.4 Mini',
        capabilities: {
          supportsImages: true,
          supportsThinking: false,
          supportsReasoningEffort: false,
          supportsStreaming: false,
          supportsLocalSoftSkills: false,
        },
      },
    ],
    parameters: {
      thinkingLevel: {
        enabled: false,
      },
      temperature: {
        enabled: true,
        label: 'Temperature',
        default: 0.85,
        min: 0,
        max: 2,
        step: 0.05,
      },
      maxTokens: {
        enabled: true,
        label: 'Max Tokens',
        default: 8192,
        min: 256,
        max: 65535,
        step: 256,
      },
    },
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    models: [
      {
        id: 'deepseek-v4-flash',
        label: 'DeepSeek V4 Flash',
        capabilities: {
          supportsImages: false,
          supportsThinking: true,
          supportsReasoningEffort: true,
          supportsStreaming: false,
          supportsTools: false,
          supportsJsonMode: false,
          supportsHistory: false,
          supportsLocalSoftSkills: true,
        },
      },
      {
        id: 'deepseek-v4-pro',
        label: 'DeepSeek V4 Pro',
        capabilities: {
          supportsImages: false,
          supportsThinking: true,
          supportsReasoningEffort: true,
          supportsStreaming: false,
          supportsTools: false,
          supportsJsonMode: false,
          supportsHistory: false,
          supportsLocalSoftSkills: true,
        },
      },
    ],
    parameters: {
      thinking: {
        enabled: true,
        label: 'Thinking',
        default: 'enabled',
        options: [
          { id: 'enabled', label: 'Enabled' },
          { id: 'disabled', label: 'Disabled' },
        ],
      },
      reasoningEffort: {
        enabled: true,
        label: 'Reasoning',
        default: 'high',
        options: [
          { id: 'high', label: 'High' },
          { id: 'max', label: 'Max' },
        ],
      },
      thinkingLevel: {
        enabled: false,
      },
      temperature: {
        enabled: false,
      },
      maxTokens: {
        enabled: true,
        label: 'Max Tokens',
        default: 8192,
        min: 256,
        max: 65535,
        step: 256,
      },
    },
  },
];

const LLM_SPECS_URL = 'http://127.0.0.1:8000/api/llm/specs';

export const normalizeLLMSpecs = (payload) => {
  const providers = Array.isArray(payload?.providers) ? payload.providers : [];
  return providers
    .filter((provider) => typeof provider?.id === 'string' && typeof provider?.label === 'string')
    .map((provider) => ({
      id: provider.id,
      label: provider.label,
      models: (Array.isArray(provider.models) ? provider.models : [])
        .filter((model) => typeof model?.id === 'string' && typeof model?.label === 'string' && model.enabled !== false)
        .map((model) => ({
          id: model.id,
          label: model.label,
          capabilities: {
            supportsImages: model.supportsImages === true,
            supportsThinking: false,
            supportsReasoningEffort: false,
            supportsStreaming: model.streaming === true,
            supportsTools: false,
            supportsJsonMode: false,
            supportsHistory: false,
            supportsLocalSoftSkills: false,
            ...(model.capabilities || {}),
          },
        })),
      parameters: provider.parameters || {},
    }));
};

export const fetchLLMProviders = async (fetchImpl = globalThis.fetch) => {
  if (typeof fetchImpl !== 'function') {
    throw new Error('LLM specs request is unavailable');
  }
  const response = await fetchImpl(LLM_SPECS_URL);
  if (!response.ok) {
    throw new Error('Failed to load LLM specs');
  }
  const providers = normalizeLLMSpecs(await response.json());
  if (!providers.length) {
    throw new Error('Invalid LLM specs response');
  }
  return providers;
};

const providerList = (providers) => (Array.isArray(providers) && providers.length ? providers : LLM_PROVIDERS);

export const getLLMProvider = (providerId, providers = LLM_PROVIDERS) => {
  return providerList(providers).find((provider) => provider.id === providerId) || null;
};

export const getLLMProviderLabel = (providerId, providers = LLM_PROVIDERS) => {
  return getLLMProvider(providerId, providers)?.label || providerId;
};

export const getLLMModelsByProvider = (providerId, providers = LLM_PROVIDERS) => {
  return getLLMProvider(providerId, providers)?.models || [];
};

export const getLLMModelLabel = (providerId, modelId, providers = LLM_PROVIDERS) => {
  const models = getLLMModelsByProvider(providerId, providers);
  return models.find((model) => model.id === modelId)?.label || modelId;
};

export const getLLMModelConfig = (providerId, modelId, providers = LLM_PROVIDERS) => {
  const models = getLLMModelsByProvider(providerId, providers);
  return models.find((model) => model.id === modelId) || models[0] || null;
};

export const getLLMModelCapabilities = (providerId, modelId, providers = LLM_PROVIDERS) => ({
  supportsImages: true,
  supportsThinking: false,
  supportsReasoningEffort: false,
  supportsStreaming: false,
  supportsTools: false,
  supportsJsonMode: false,
  supportsHistory: false,
  supportsLocalSoftSkills: false,
  ...(getLLMModelConfig(providerId, modelId, providers)?.capabilities || {}),
});

export const getActiveLLMInputHandles = (providerId, modelId, providers = LLM_PROVIDERS) => {
  const handles = ['text:in'];
  if (getLLMModelCapabilities(providerId, modelId, providers).supportsImages) {
    handles.push('image:in');
  }
  return handles;
};

export const getFirstLLMModelId = (providerId, providers = LLM_PROVIDERS) => {
  return getLLMModelsByProvider(providerId, providers)[0]?.id || '';
};

export const getLLMParametersByProvider = (providerId, providers = LLM_PROVIDERS) => {
  return getLLMProvider(providerId, providers)?.parameters || {};
};

export const getDefaultLLMParameters = (providerId, providers = LLM_PROVIDERS) => {
  const parameters = getLLMParametersByProvider(providerId, providers);

  return {
    thinking: parameters.thinking?.enabled
      ? parameters.thinking.default
      : undefined,
    reasoningEffort: parameters.reasoningEffort?.enabled
      ? parameters.reasoningEffort.default
      : undefined,
    thinkingLevel: parameters.thinkingLevel?.enabled
      ? parameters.thinkingLevel.default
      : undefined,
    temperature: parameters.temperature?.default ?? 0.85,
    maxTokens: parameters.maxTokens?.default ?? 65535,
  };
};
