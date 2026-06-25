import { sanitizeVideoNodeDataForSave } from './videoNodeData.js';

const SENSITIVE_TEXT_PATTERN = /api[-_]?key|authorization|bearer|secret[-_]?key|private[-_]?key|access[-_]?key|data:(image|video|audio)\/[^;]+;base64|raw schema/i;
const WINDOWS_ABSOLUTE_PATTERN = /[a-zA-Z]:[\\/][^"'\s]*/;
const UNIX_ABSOLUTE_PATTERN = /^\/(Users|home|var|tmp|etc|Volumes)\//;

const scrubObject = (value) => {
  if (value == null) return value;
  if (typeof value === 'string') {
    if (SENSITIVE_TEXT_PATTERN.test(value) || WINDOWS_ABSOLUTE_PATTERN.test(value) || UNIX_ABSOLUTE_PATTERN.test(value)) return undefined;
    return value;
  }
  if (Array.isArray(value)) return value.map(scrubObject).filter((item) => item !== undefined);
  if (typeof value === 'object') {
    const next = {};
    Object.entries(value).forEach(([key, child]) => {
      if (SENSITIVE_TEXT_PATTERN.test(key)) return;
      const cleanChild = scrubObject(child);
      if (cleanChild !== undefined) next[key] = cleanChild;
    });
    return next;
  }
  return value;
};

export const sanitizeProjectForSave = ({ nodes = [], edges = [], groups = {} } = {}) => ({
  nodes: nodes.map((node) => {
    const sanitizedNode = scrubObject({ ...node }) || {};
    if (node.type === 'videoNode') {
      sanitizedNode.data = sanitizeVideoNodeDataForSave(node.data || {});
    }
    return sanitizedNode;
  }),
  edges: scrubObject(edges) || [],
  groups: scrubObject(groups) || {},
});
