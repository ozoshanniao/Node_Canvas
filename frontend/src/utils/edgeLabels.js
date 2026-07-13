import {
  getCanonicalInputEdges,
  getEdgeTargetHandle,
  isImageOrderedTargetHandle,
  migrateLegacyConnectionOrders,
} from './edgeOrdering.js';

export const isImageLabelTargetHandle = isImageOrderedTargetHandle;

export const shouldShowImageInputEdgeLabel = (targetHandle, inputLabel, shouldReveal = false) =>
  Boolean(shouldReveal) &&
  isImageLabelTargetHandle(targetHandle) &&
  (/^image\d+$/.test(inputLabel) || inputLabel === 'END');

export const getImageEdgeUiVisibility = ({
  selected,
  sourceSelected,
  targetSelected,
  targetHandle,
  inputLabel,
} = {}) => ({
  showImageLabel: shouldShowImageInputEdgeLabel(
    targetHandle,
    inputLabel,
    Boolean(selected || sourceSelected || targetSelected)
  ),
  showDeleteControl: Boolean(selected),
});

export const getDerivedImageInputEdgeLabel = (edge, edges = []) => {
  const targetHandle = getEdgeTargetHandle(edge);
  if (targetHandle === 'image:firstFrame') return 'image1';
  if (targetHandle === 'image:lastFrame') return 'image2';
  if (targetHandle === 'image:end') return 'END';
  if (!isImageLabelTargetHandle(targetHandle)) return edge?.data?.label || '';

  const canonicalEdges = getCanonicalInputEdges({
    edges,
    targetNodeId: edge?.target,
    targetHandle,
  });
  const index = canonicalEdges.findIndex((candidate) => candidate.id === edge?.id);
  return index >= 0 ? 'image' + (index + 1) : edge?.data?.label || '';
};

// Compatibility export for existing call sites. Labels are now derived at render time.
export const normalizeImageInputEdgeLabels = migrateLegacyConnectionOrders;
