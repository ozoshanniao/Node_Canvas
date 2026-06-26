import { sanitizePersistedKlingOmniReferences } from './klingOmniReferences.js';

const cloneValue = (value) => {
  if (Array.isArray(value)) return value.map(cloneValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, childValue]) => [key, cloneValue(childValue)])
    );
  }
  return value;
};

const deleteFields = (data, fields) => {
  fields.forEach((field) => {
    delete data[field];
  });
};

const COMMON_GENERATION_RUNTIME_FIELDS = [
  'runRequestId', 'status', 'progress', 'error', 'errorMessage',
  'loading', 'isLoading', 'submitting', 'isSubmitting', 'running', 'isRunning',
];

const IMAGE_RUNTIME_FIELDS = [
  ...COMMON_GENERATION_RUNTIME_FIELDS,
  'url', 'urls', 'selectedIndex', 'currentIndex', 'task', 'outputImages',
  'outputMetadata', 'dataUrl', 'previewUrl', 'previewSourceUrl',
];

const VIDEO_RUNTIME_FIELDS = [
  ...COMMON_GENERATION_RUNTIME_FIELDS,
  'task', 'outputs', 'isPolling', 'polling', 'pollingTaskId', 'pollingIntervalId',
  'videoUrl', 'localVideoUrl', 'outputVideo', 'outputVideoUrl', 'outputVideoPath',
  'outputVideoWarning', 'lastFrame', 'lastFrameUrl', 'coverUrl', 'previewFrames',
  'outputMetadata',
];

export const sanitizePastedNodeData = (nodeType, sourceData = {}) => {
  const sanitized = cloneValue(sourceData || {});
  if (nodeType === 'imageNode') deleteFields(sanitized, IMAGE_RUNTIME_FIELDS);
  else if (nodeType === 'videoNode') {
    deleteFields(sanitized, VIDEO_RUNTIME_FIELDS);
    if (sanitized.customParams) {
      sanitized.customParams = sanitizePersistedKlingOmniReferences(sanitized.customParams);
    }
    if (sanitized.params?.customParams) {
      sanitized.params.customParams = sanitizePersistedKlingOmniReferences(sanitized.params.customParams);
    }
  }
  return sanitized;
};
