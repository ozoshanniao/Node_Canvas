export const LLM_PROVIDERS = [
  {
    id: 'Google',
    label: 'Google',
    models: [
      {
        id: 'gemini-3.1-flash-lite',
        label: 'Gemini 3.1 Flash',
      },
      {
        id: 'gemini-3.1-pro-preview',
        label: 'Gemini 3.1 Pro',
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
      },
      {
        id: 'gemini-3.1-pro-preview',
        label: 'Gemini 3.1 Pro',
      },
      {
        id: 'gpt-5.4-mini',
        label: 'GPT 5.4 Mini',
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
];

export const getLLMProvider = (providerId) => {
  return LLM_PROVIDERS.find((provider) => provider.id === providerId) || LLM_PROVIDERS[0];
};

export const getLLMProviderLabel = (providerId) => {
  return getLLMProvider(providerId)?.label || providerId;
};

export const getLLMModelsByProvider = (providerId) => {
  return getLLMProvider(providerId)?.models || [];
};

export const getLLMModelLabel = (providerId, modelId) => {
  const models = getLLMModelsByProvider(providerId);
  return models.find((model) => model.id === modelId)?.label || modelId;
};

export const getFirstLLMModelId = (providerId) => {
  return getLLMModelsByProvider(providerId)[0]?.id || '';
};

export const getLLMParametersByProvider = (providerId) => {
  return getLLMProvider(providerId)?.parameters || {};
};

export const getDefaultLLMParameters = (providerId) => {
  const parameters = getLLMParametersByProvider(providerId);

  return {
    thinkingLevel: parameters.thinkingLevel?.enabled
      ? parameters.thinkingLevel.default
      : undefined,
    temperature: parameters.temperature?.default ?? 0.85,
    maxTokens: parameters.maxTokens?.default ?? 65535,
  };
};
