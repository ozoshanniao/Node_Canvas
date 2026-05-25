const isImageLabelTargetHandle = (targetHandle) =>
  targetHandle === 'image:in' ||
  targetHandle === 'image:images' ||
  targetHandle === 'image:references' ||
  targetHandle === 'image:end';

export function normalizeImageInputEdgeLabels(edges = []) {
  const groupCounters = new Map();
  let changed = false;

  const nextEdges = edges.map((edge) => {
    const targetHandle = edge.targetHandle ?? edge.targetHandleId;
    if (!isImageLabelTargetHandle(targetHandle)) return edge;

    let nextData;
    if (targetHandle === 'image:end') {
      nextData = {
        ...(edge.data || {}),
        kind: 'image',
        inputLabel: 'END',
      };
      if ('imageIndex' in nextData) {
        delete nextData.imageIndex;
      }
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
