const PROVIDER_SETTINGS_URL = 'http://127.0.0.1:8000/api/settings/providers';

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
