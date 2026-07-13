import { collectCanonicalImageInputs } from './nodeOutputs.js';
import { validateInputCardinality } from './edgeOrdering.js';

export const collectVideoImageHandle = ({
  targetNodeId,
  targetHandle,
  edges = [],
  nodes = [],
} = {}) => {
  const items = collectCanonicalImageInputs({
    targetNodeId,
    targetHandle,
    edges,
    nodes,
  });
  return {
    items,
    images: items.filter((item) => item.url).map((item) => item.url),
    errors: items
      .filter((item) => !item.url)
      .map((item) => 'Image input image' + (item.index + 1) + ' has no usable image.'),
  };
};

export const validateVideoInputHandles = ({
  targetNodeId,
  handles = [],
  edges = [],
  nodes = [],
} = {}) => {
  const targetNode = nodes.find((node) => node.id === targetNodeId);
  return handles
    .map((targetHandle) => validateInputCardinality({
      edges,
      targetNode,
      targetNodeId,
      targetHandle,
    }))
    .filter((result) => !result.isValid)
    .map((result) => result.error);
};

export const getReferenceImageLimitError = (images = [], maxItems = Number.POSITIVE_INFINITY) =>
  Number.isFinite(maxItems) && images.length > maxItems
    ? 'image:references accepts at most ' + maxItems +
      ' inputs, but ' + images.length + ' are connected.'
    : '';
