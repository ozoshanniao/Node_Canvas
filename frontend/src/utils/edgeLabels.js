export function normalizeImageInputEdgeLabels(edges = []) {
  const groupCounters = new Map();
  let changed = false;

  const nextEdges = edges.map((edge) => {
    const targetHandle = edge.targetHandle ?? edge.targetHandleId;
    if (targetHandle !== 'image:in') return edge;

    const groupKey = `${edge.target}:${targetHandle}`;
    const imageIndex = groupCounters.get(groupKey) || 0;
    groupCounters.set(groupKey, imageIndex + 1);

    const nextData = {
      ...(edge.data || {}),
      kind: 'image',
      imageIndex,
      inputLabel: `image${imageIndex + 1}`,
    };

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
