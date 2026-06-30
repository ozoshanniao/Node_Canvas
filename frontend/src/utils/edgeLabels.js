export const isImageLabelTargetHandle = (targetHandle) =>
  targetHandle === 'image:in' ||
  targetHandle === 'image:images' ||
  targetHandle === 'image:references' ||
  targetHandle === 'image:firstFrame' ||
  targetHandle === 'image:lastFrame' ||
  targetHandle === 'image:end';

const IMAGE_FRAME_LABELS = {
  'image:firstFrame': {
    imageIndex: 0,
    inputLabel: 'image1',
  },
  'image:lastFrame': {
    imageIndex: 1,
    inputLabel: 'image2',
  },
};

export const shouldShowImageInputEdgeLabel = (targetHandle, inputLabel, showEdgeControls = false) =>
  isImageLabelTargetHandle(targetHandle) &&
  Boolean(inputLabel) &&
  (/^image\d+$/.test(inputLabel) || showEdgeControls);

export const shouldShowEdgeControls = ({ selected, sourceSelected, targetSelected } = {}) =>
  Boolean(selected || sourceSelected || targetSelected);

const MEDIA_REFERENCE_LABELS = {
  'video:references': {
    kind: 'video',
    indexKey: 'videoIndex',
    labelPrefix: 'video',
  },
  'audio:references': {
    kind: 'audio',
    indexKey: 'audioIndex',
    labelPrefix: 'audio',
  },
};

export function normalizeImageInputEdgeLabels(edges = []) {
  const groupCounters = new Map();
  let changed = false;

  const nextEdges = edges.map((edge) => {
    const targetHandle = edge.targetHandle ?? edge.targetHandleId;
    const mediaConfig = MEDIA_REFERENCE_LABELS[targetHandle];
    if (!isImageLabelTargetHandle(targetHandle) && !mediaConfig) return edge;

    let nextData;
    if (mediaConfig) {
      const groupKey = `${edge.target}:${targetHandle}`;
      const mediaIndex = groupCounters.get(groupKey) || 0;
      groupCounters.set(groupKey, mediaIndex + 1);

      nextData = {
        ...(edge.data || {}),
        kind: mediaConfig.kind,
        [mediaConfig.indexKey]: mediaIndex,
        inputLabel: `${mediaConfig.labelPrefix}${mediaIndex + 1}`,
      };
    } else if (targetHandle === 'image:end') {
      nextData = {
        ...(edge.data || {}),
        kind: 'image',
        inputLabel: 'END',
      };
      if ('imageIndex' in nextData) {
        delete nextData.imageIndex;
      }
    } else if (IMAGE_FRAME_LABELS[targetHandle]) {
      nextData = {
        ...(edge.data || {}),
        kind: 'image',
        ...IMAGE_FRAME_LABELS[targetHandle],
      };
    } else {
      const groupKey = `${edge.target}:${targetHandle}`;
      const imageIndex = groupCounters.get(groupKey) || 0;
      groupCounters.set(groupKey, imageIndex + 1);

      nextData = {
        ...(edge.data || {}),
        kind: 'image',
        imageIndex,
        inputLabel: `image${imageIndex + 1}`,
      };
    }

    if (
      edge.data?.kind === nextData.kind &&
      edge.data?.imageIndex === nextData.imageIndex &&
      edge.data?.videoIndex === nextData.videoIndex &&
      edge.data?.audioIndex === nextData.audioIndex &&
      edge.data?.inputLabel === nextData.inputLabel
    ) {
      return edge;
    }

    changed = true;
    return {
      ...edge,
      data: nextData,
    };
  });

  return changed ? nextEdges : edges;
}
