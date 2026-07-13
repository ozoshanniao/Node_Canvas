const IMAGE_REFERENCE_HANDLE_ALIASES = new Map([
  ['image:references[]', 'image:references'],
]);

const IMAGE_ORDERED_HANDLES = new Set([
  'image:in',
  'image:images',
  'image:references',
  'image:firstFrame',
  'image:lastFrame',
  'image:end',
]);

const EXPLICIT_SINGLE_IMAGE_HANDLES = new Set([
  'image:firstFrame',
  'image:lastFrame',
  'image:images',
  'image:end',
]);

export const getEdgeTargetHandle = (edge = {}) => edge.targetHandle ?? edge.targetHandleId ?? '';

export const getLogicalInputHandle = (targetHandle = '') =>
  IMAGE_REFERENCE_HANDLE_ALIASES.get(targetHandle) || targetHandle;

export const isImageOrderedTargetHandle = (targetHandle = '') =>
  IMAGE_ORDERED_HANDLES.has(getLogicalInputHandle(targetHandle));

export const isValidConnectionOrder = (value) =>
  Number.isSafeInteger(value) && value >= 0;

const isSelectableEdge = (edge) =>
  edge &&
  typeof edge === 'object' &&
  typeof edge.id === 'string' &&
  edge.id.length > 0 &&
  typeof edge.source === 'string' &&
  edge.source.length > 0 &&
  typeof edge.target === 'string' &&
  edge.target.length > 0 &&
  Boolean(getEdgeTargetHandle(edge));

const getComparableOrder = (edge, originalIndex) =>
  isValidConnectionOrder(edge?.data?.connectionOrder)
    ? edge.data.connectionOrder
    : originalIndex;

const compareIndexedEdges = (left, right) => {
  const orderDifference =
    getComparableOrder(left.edge, left.originalIndex) -
    getComparableOrder(right.edge, right.originalIndex);
  if (orderDifference !== 0) return orderDifference;

  const legacyDifference = left.originalIndex - right.originalIndex;
  if (legacyDifference !== 0) return legacyDifference;
  const leftId = String(left.edge?.id || '');
  const rightId = String(right.edge?.id || '');
  if (leftId < rightId) return -1;
  if (leftId > rightId) return 1;
  return 0;
};

const getGroupKey = (edge = {}) => {
  const targetHandle = getLogicalInputHandle(getEdgeTargetHandle(edge));
  return String(edge.target || '') + '\u0000' + targetHandle;
};

export const stripDerivedImageEdgeData = (edge = {}) => {
  if (!isImageOrderedTargetHandle(getEdgeTargetHandle(edge))) return edge;

  const data = { ...(edge.data || {}) };
  const hadImageIndex = Object.prototype.hasOwnProperty.call(data, 'imageIndex');
  const hadInputLabel = Object.prototype.hasOwnProperty.call(data, 'inputLabel');
  if (!hadImageIndex && !hadInputLabel) return edge;

  delete data.imageIndex;
  delete data.inputLabel;
  return { ...edge, data };
};

export function getCanonicalInputEdges({ edges = [], targetNodeId, targetHandle } = {}) {
  const logicalHandle = getLogicalInputHandle(targetHandle);
  return edges
    .map((edge, originalIndex) => ({ edge, originalIndex }))
    .filter(({ edge }) =>
      isSelectableEdge(edge) &&
      edge.target === targetNodeId &&
      getLogicalInputHandle(getEdgeTargetHandle(edge)) === logicalHandle
    )
    .sort(compareIndexedEdges)
    .map(({ edge }) => edge);
}

export function migrateLegacyConnectionOrders(edges = []) {
  const nextEdges = edges.map(stripDerivedImageEdgeData);
  const groups = new Map();

  nextEdges.forEach((edge, originalIndex) => {
    if (!isSelectableEdge(edge) || !isImageOrderedTargetHandle(getEdgeTargetHandle(edge))) return;
    const key = getGroupKey(edge);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ edge, originalIndex });
  });

  const orderByIndex = new Map();
  groups.forEach((entries) => {
    const seenOrders = new Set();
    const needsMigration = entries.some(({ edge }) => {
      const order = edge.data?.connectionOrder;
      if (!isValidConnectionOrder(order) || seenOrders.has(order)) return true;
      seenOrders.add(order);
      return false;
    });
    if (!needsMigration) return;

    entries
      .slice()
      .sort(compareIndexedEdges)
      .forEach(({ originalIndex }, connectionOrder) => {
        orderByIndex.set(originalIndex, connectionOrder);
      });
  });

  let changed = nextEdges.some((edge, index) => edge !== edges[index]);
  const migrated = nextEdges.map((edge, index) => {
    if (!orderByIndex.has(index)) return edge;
    const connectionOrder = orderByIndex.get(index);
    if (edge.data?.connectionOrder === connectionOrder) return edge;
    changed = true;
    return {
      ...edge,
      data: {
        ...(edge.data || {}),
        connectionOrder,
      },
    };
  });

  return changed ? migrated : edges;
}

export function assignConnectionOrder(edge, existingEdges = []) {
  const cleanEdge = stripDerivedImageEdgeData(edge);
  const targetHandle = getEdgeTargetHandle(cleanEdge);
  if (!isSelectableEdge(cleanEdge) || !isImageOrderedTargetHandle(targetHandle)) return cleanEdge;

  const currentGroup = getCanonicalInputEdges({
    edges: existingEdges,
    targetNodeId: cleanEdge.target,
    targetHandle,
  });
  const maxOrder = currentGroup.reduce(
    (maximum, currentEdge, index) =>
      Math.max(
        maximum,
        isValidConnectionOrder(currentEdge.data?.connectionOrder)
          ? currentEdge.data.connectionOrder
          : index
      ),
    -1
  );

  return {
    ...cleanEdge,
    data: {
      ...(cleanEdge.data || {}),
      connectionOrder: maxOrder + 1,
    },
  };
}

export function appendEdgesWithConnectionOrder(existingEdges = [], edgesToAdd = []) {
  const baseEdges = migrateLegacyConnectionOrders(existingEdges);
  const indexedNewEdges = edgesToAdd.map((edge, originalIndex) => ({
    edge: stripDerivedImageEdgeData(edge),
    originalIndex,
  }));
  const groups = new Map();

  indexedNewEdges.forEach((entry) => {
    if (!isSelectableEdge(entry.edge) || !isImageOrderedTargetHandle(getEdgeTargetHandle(entry.edge))) return;
    const key = getGroupKey(entry.edge);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  });

  const assignedByIndex = new Map();
  groups.forEach((entries) => {
    const sample = entries[0].edge;
    const currentGroup = getCanonicalInputEdges({
      edges: baseEdges,
      targetNodeId: sample.target,
      targetHandle: getEdgeTargetHandle(sample),
    });
    let nextOrder = currentGroup.reduce(
      (maximum, currentEdge) =>
        isValidConnectionOrder(currentEdge.data?.connectionOrder)
          ? Math.max(maximum, currentEdge.data.connectionOrder)
          : maximum,
      -1
    ) + 1;

    entries
      .slice()
      .sort(compareIndexedEdges)
      .forEach(({ edge, originalIndex }) => {
        assignedByIndex.set(originalIndex, {
          ...edge,
          data: {
            ...(edge.data || {}),
            connectionOrder: nextOrder,
          },
        });
        nextOrder += 1;
      });
  });

  const assignedEdges = indexedNewEdges.map(({ edge, originalIndex }) =>
    assignedByIndex.get(originalIndex) || edge
  );
  return baseEdges.concat(assignedEdges);
}

export function assignReconnectedConnectionOrder({
  oldEdge,
  reconnectedEdge,
  existingEdges = [],
} = {}) {
  if (!oldEdge || !reconnectedEdge) return reconnectedEdge;
  const sameInputGroup =
    oldEdge.target === reconnectedEdge.target &&
    getLogicalInputHandle(getEdgeTargetHandle(oldEdge)) ===
      getLogicalInputHandle(getEdgeTargetHandle(reconnectedEdge));
  return sameInputGroup
    ? stripDerivedImageEdgeData(reconnectedEdge)
    : assignConnectionOrder(reconnectedEdge, existingEdges);
}

const getSchemaConnectionLimit = (targetNode, targetHandle) => {
  const logicalHandle = getLogicalInputHandle(targetHandle);
  const inputCapabilities = targetNode?.data?.schemaSnapshot?.inputCapabilities || {};
  const capability = inputCapabilities[targetHandle] || inputCapabilities[logicalHandle];
  const rawLimit = capability?.metadata?.maxItems ?? capability?.maxItems;
  const limit = Number(rawLimit);
  return Number.isInteger(limit) && limit >= 0 ? limit : null;
};

export function getInputConnectionLimit({ targetNode, targetHandle } = {}) {
  const logicalHandle = getLogicalInputHandle(targetHandle);
  if (EXPLICIT_SINGLE_IMAGE_HANDLES.has(logicalHandle)) return 1;
  return getSchemaConnectionLimit(targetNode, logicalHandle) ?? Number.POSITIVE_INFINITY;
}

export function validateInputCardinality({
  edges = [],
  targetNode,
  targetNodeId = targetNode?.id,
  targetHandle,
  excludeEdgeId,
} = {}) {
  const limit = getInputConnectionLimit({ targetNode, targetHandle });
  const matchingEdges = getCanonicalInputEdges({ edges, targetNodeId, targetHandle })
    .filter((edge) => edge.id !== excludeEdgeId);
  const count = matchingEdges.length;
  const isValid = !Number.isFinite(limit) || count <= limit;
  return {
    isValid,
    count,
    limit,
    error: isValid
      ? ''
      : getLogicalInputHandle(targetHandle) + ' accepts at most ' + limit + ' input' +
        (limit === 1 ? '' : 's') + ', but ' + count + ' are connected.',
  };
}

export function isConnectionAllowed({ connection, edges = [], nodes = [], excludeEdgeId } = {}) {
  if (!connection?.sourceHandle || !connection?.targetHandle || !connection?.target) return false;
  if (connection.sourceHandle.split(':')[0] !== connection.targetHandle.split(':')[0]) return false;

  const targetNode = nodes.find((node) => node.id === connection.target);
  const limit = getInputConnectionLimit({ targetNode, targetHandle: connection.targetHandle });
  if (!Number.isFinite(limit)) return true;

  const currentCount = getCanonicalInputEdges({
    edges,
    targetNodeId: connection.target,
    targetHandle: connection.targetHandle,
  }).filter((edge) => edge.id !== excludeEdgeId).length;
  return currentCount < limit;
}
