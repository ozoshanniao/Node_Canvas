export const stopEdgeActionEvent = (event) => {
  event?.preventDefault?.();
  event?.stopPropagation?.();
};

export const removeEdgesByIds = (edges = [], edgeIds = []) => {
  const ids = new Set(edgeIds);
  if (ids.size === 0) return edges;
  const nextEdges = edges.filter((edge) => !ids.has(edge.id));
  return nextEdges.length === edges.length ? edges : nextEdges;
};
