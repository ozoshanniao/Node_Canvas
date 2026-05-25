export const LLM_PROVIDERS = [
  {
    id: 'Google',
    label: 'Google',
    models: [
      {
        id: 'gemini-3.1-flash-lite',
        label: 'Gemini 3.1 Flash',
        capabilities: {
          supportsImages: true,
          supportsThinking: true,
          supportsReasoningEffort: false,
          supportsStreaming: false,
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
    label: 'DeepSeek Official',
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

export const getLLMModelConfig = (providerId, modelId) => {
  const models = getLLMModelsByProvider(providerId);
  return models.find((model) => model.id === modelId) || models[0] || null;
};

export const getLLMModelCapabilities = (providerId, modelId) => ({
  supportsImages: true,
  supportsThinking: false,
  supportsReasoningEffort: false,
  supportsStreaming: false,
  supportsTools: false,
  supportsJsonMode: false,
  supportsHistory: false,
  ...(getLLMModelConfig(providerId, modelId)?.capabilities || {}),
});

export const getActiveLLMInputHandles = (providerId, modelId) => {
  const handles = ['text:in'];
  if (getLLMModelCapabilities(providerId, modelId).supportsImages) {
    handles.push('image:in');
  }
  return handles;
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
