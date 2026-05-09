export const DEFAULTS_STORAGE_KEY = 'node-ai-canvas:lastNodeDefaults';

const DEFAULT_FIELDS = {
  imageGeneration: [
    'provider',
    'model',
    'ratio',
    'aspectRatio',
    'resolution',
    'imageSize',
    'size',
    'quality',
    'format',
    'background',
    'n',
  ],
};

const readDefaultsStore = () => {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(window.localStorage.getItem(DEFAULTS_STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
};

const writeDefaultsStore = (store) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(DEFAULTS_STORAGE_KEY, JSON.stringify(store));
};

export const sanitizeNodeDefaults = (nodeKind, data = {}) => {
  const fields = DEFAULT_FIELDS[nodeKind] || [];
  return fields.reduce((defaults, field) => {
    const value = data[field];
    if (value !== undefined && value !== null && value !== '') {
      defaults[field] = value;
    }
    return defaults;
  }, {});
};

export const getLastNodeDefaults = (nodeKind) => readDefaultsStore()[nodeKind] || {};

export const setLastNodeDefaults = (nodeKind, patch = {}) => {
  const sanitizedPatch = sanitizeNodeDefaults(nodeKind, patch);
  if (Object.keys(sanitizedPatch).length === 0) return;

  const store = readDefaultsStore();
  store[nodeKind] = {
    ...(store[nodeKind] || {}),
    ...sanitizedPatch,
  };
  writeDefaultsStore(store);
  console.log('[NodeDefaults] save', nodeKind, store[nodeKind]);
};

export const mergeNodeDefaults = (nodeKind, baseData = {}) => {
  const merged = {
    ...baseData,
    ...getLastNodeDefaults(nodeKind),
  };
  console.log('[NodeDefaults] apply', nodeKind, sanitizeNodeDefaults(nodeKind, merged));
  return merged;
};
