const PROVIDER_SETTINGS_URL = 'http://127.0.0.1:8000/api/settings/providers';

const API_KEY_FIELD = {
  id: 'apiKey',
  labelKey: 'settings.providers.apiKey',
  placeholderKey: 'settings.providers.enterApiKey',
  secret: true,
  required: true,
};

export const PROVIDER_FIELDS = {
  deepseek: [API_KEY_FIELD],
  google: [API_KEY_FIELD],
  google_studio: [API_KEY_FIELD],
  openai: [
    API_KEY_FIELD,
    { id: 'baseUrl', label: 'Base URL', placeholder: 'https://api.openai.com/v1', secret: false, required: false },
  ],
  anthropic: [API_KEY_FIELD],
  yunwu: [API_KEY_FIELD],
  seedance: [API_KEY_FIELD],
  kie: [API_KEY_FIELD],
  fal: [API_KEY_FIELD],
  wavespeed: [API_KEY_FIELD],
  kling: [
    { id: 'accessKey', labelKey: 'settings.providers.accessKey', placeholderKey: 'settings.providers.enterAccessKey', secret: true, required: true },
    { id: 'secretKey', labelKey: 'settings.providers.secretKey', placeholderKey: 'settings.providers.enterSecretKey', secret: true, required: true },
  ],
  'cloudflare-r2': [
    { id: 'accessKeyId', labelKey: 'settings.providers.accessKeyId', placeholderKey: 'settings.providers.enterAccessKeyId', secret: true, required: true },
    { id: 'secretAccessKey', labelKey: 'settings.providers.secretAccessKey', placeholderKey: 'settings.providers.enterSecretAccessKey', secret: true, required: true },
  ],
};

const normalizeStringList = (value) =>
  Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];

export const normalizeProviderStatus = (provider) => ({
  id: typeof provider?.id === 'string' ? provider.id : '',
  name: typeof provider?.name === 'string' ? provider.name : '',
  configured: provider?.configured === true,
  source: ['env', 'settings'].includes(provider?.source) ? provider.source : 'none',
  supportsSettings: provider?.supportsSettings === true,
  requiredEnv: normalizeStringList(provider?.requiredEnv),
  missingEnv: normalizeStringList(provider?.missingEnv),
  missingDependencyEnv: normalizeStringList(provider?.missingDependencyEnv),
  requiredSettings: normalizeStringList(provider?.requiredSettings),
  settingsFields: normalizeStringList(provider?.settingsFields),
  publicSettings: provider?.publicSettings && typeof provider.publicSettings === 'object'
    ? Object.fromEntries(Object.entries(provider.publicSettings).filter(([key, value]) => typeof value === 'string' && !['apiKey', 'accessKey', 'accessKeyId', 'secretKey', 'secretAccessKey'].includes(key)))
    : {},
  missingSettings: normalizeStringList(provider?.missingSettings),
});

const requireFetch = (fetchImpl) => {
  if (typeof fetchImpl !== 'function') {
    throw new Error('Provider settings request is unavailable');
  }
};

const requireSuccessResponse = async (response, message) => {
  if (!response.ok) {
    throw new Error(message);
  }
  return response.json();
};

export const fetchProviderSettings = async (fetchImpl = globalThis.fetch) => {
  requireFetch(fetchImpl);
  const response = await fetchImpl(PROVIDER_SETTINGS_URL);
  const payload = await requireSuccessResponse(response, 'Failed to load provider settings');
  if (payload?.status !== 'success' || !Array.isArray(payload.providers)) {
    throw new Error('Invalid provider settings response');
  }

  return payload.providers.map(normalizeProviderStatus).filter((provider) => provider.id && provider.name);
};

export const saveProviderSettings = async (providerId, values, fetchImpl = globalThis.fetch) => {
  requireFetch(fetchImpl);
  const response = await fetchImpl(`${PROVIDER_SETTINGS_URL}/${encodeURIComponent(providerId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(values),
  });
  const payload = await requireSuccessResponse(response, 'Failed to save provider settings');
  if (payload?.status !== 'success' || !payload.provider) {
    throw new Error('Invalid provider settings response');
  }
  return normalizeProviderStatus(payload.provider);
};

export const clearProviderSettings = async (providerId, fetchImpl = globalThis.fetch) => {
  requireFetch(fetchImpl);
  const response = await fetchImpl(`${PROVIDER_SETTINGS_URL}/${encodeURIComponent(providerId)}`, {
    method: 'DELETE',
  });
  const payload = await requireSuccessResponse(response, 'Failed to clear provider settings');
  if (payload?.status !== 'success' || !payload.provider) {
    throw new Error('Invalid provider settings response');
  }
  return normalizeProviderStatus(payload.provider);
};
