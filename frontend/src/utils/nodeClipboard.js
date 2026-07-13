import { sanitizePersistedKlingOmniReferences } from './klingOmniReferences.js';
import { VIDEO_PARAM_KEYS, pickLegacyVideoParams } from './videoNodeData.js';
import { appendEdgesWithConnectionOrder } from './edgeOrdering.js';

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
    const legacyParams = pickLegacyVideoParams(sanitized);
    const hasLegacyParams = Object.keys(legacyParams).length > 0;
    if (hasLegacyParams || sanitized.params) {
      sanitized.params = {
        ...legacyParams,
        ...(sanitized.params || {}),
      };
    }
    deleteFields(sanitized, VIDEO_PARAM_KEYS);
    if (sanitized.customParams) {
      sanitized.customParams = sanitizePersistedKlingOmniReferences(sanitized.customParams);
    }
    if (sanitized.params?.customParams) {
      delete sanitized.params.customParams;
    }
  }
  return sanitized;
};
export const preparePastedEdges = ({
  clipboardEdges = [],
  currentEdges = [],
  oldToNewIdMap = {},
  createEdgeId = (_edge, index) => 'pasted-edge-' + index,
} = {}) => {
  const remappedEdges = clipboardEdges
    .map((oldEdge, index) => {
      const source = oldToNewIdMap[oldEdge.source];
      const target = oldToNewIdMap[oldEdge.target];
      if (!source || !target) return null;
      return {
        ...oldEdge,
        id: createEdgeId(oldEdge, index),
        source,
        target,
        selected: false,
      };
    })
    .filter(Boolean);

  return appendEdgesWithConnectionOrder(currentEdges, remappedEdges);
};
