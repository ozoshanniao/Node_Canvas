const IMAGE_ALIAS_PATTERN = /^image_\d+$/;
const IMAGE_ROLES = new Set(['reference', 'first_frame', 'end_frame']);
const RAW_REFERENCE_KEYS = new Set(['url', 'uri', 'path', 'endpoint', 'token', 'key']);

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const cleanString = (value) => {
  if (typeof value !== 'string') return '';
  return value.trim();
};

const sanitizeRole = (value) => {
  const role = cleanString(value);
  return IMAGE_ROLES.has(role) ? role : 'reference';
};

export const sanitizePersistedKlingOmniReferences = (customParams = {}) => {
  if (!isPlainObject(customParams)) return {};
  const nextCustomParams = structuredClone(customParams);
  const omniParams = nextCustomParams.kling?.omniParams;
  if (!isPlainObject(omniParams) || !Array.isArray(omniParams.images)) {
    return nextCustomParams;
  }

  omniParams.images = omniParams.images
    .map((item) => {
      if (!isPlainObject(item)) return null;
      const alias = cleanString(item.alias);
      const sourceNodeId = cleanString(item.sourceNodeId);
      const sourceHandle = cleanString(item.sourceHandle);
      if (!IMAGE_ALIAS_PATTERN.test(alias) || !sourceNodeId || !sourceHandle) return null;
      const descriptor = {
        alias,
        role: sanitizeRole(item.role),
        sourceNodeId,
        sourceHandle,
      };
      const elementId = cleanString(item.elementId);
      if (elementId) descriptor.elementId = elementId;
      return descriptor;
    })
    .filter(Boolean);

  return nextCustomParams;
};

export const buildRuntimeKlingOmniReferences = (omniParamsOutput = {}) => {
  const runtimeImages = [];
  const seenSources = new Map();
  const imageDescriptors = [];

  (Array.isArray(omniParamsOutput?.images) ? omniParamsOutput.images : []).forEach((item) => {
    if (!isPlainObject(item)) return;
    const url = cleanString(item.url);
    const alias = cleanString(item.alias);
    if (!url || !IMAGE_ALIAS_PATTERN.test(alias)) return;

    const sourceKey = [
      cleanString(item.sourceNodeId),
      cleanString(item.sourceHandle),
      url,
    ].join('\u0000');
    let index = seenSources.get(sourceKey);
    if (index === undefined) {
      index = runtimeImages.length;
      seenSources.set(sourceKey, index);
      runtimeImages.push(url);
    }

    const descriptor = {
      alias,
      role: sanitizeRole(item.role),
      index,
    };
    const elementId = cleanString(item.elementId);
    if (elementId) descriptor.elementId = elementId;
    imageDescriptors.push(descriptor);
  });

  return {
    images: runtimeImages,
    omniParams: {
      prompt: cleanString(omniParamsOutput?.prompt),
      resolvedPrompt: cleanString(omniParamsOutput?.resolvedPrompt),
      shotMode: cleanString(omniParamsOutput?.shotMode) || 'single',
      multiShot: Boolean(omniParamsOutput?.multiShot),
      multiPrompt: structuredClone(Array.isArray(omniParamsOutput?.multiPrompt) ? omniParamsOutput.multiPrompt : []),
      durationSeconds: omniParamsOutput?.durationSeconds ?? null,
      duration: cleanString(omniParamsOutput?.duration),
      images: imageDescriptors,
      videos: [],
      elements: structuredClone(Array.isArray(omniParamsOutput?.elements) ? omniParamsOutput.elements : []),
    },
  };
};

export const containsRawKlingOmniImageReferenceKey = (item = {}) =>
  isPlainObject(item) && Object.keys(item).some((key) => RAW_REFERENCE_KEYS.has(String(key)));
