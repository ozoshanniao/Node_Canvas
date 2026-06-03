export const GROUP_COLORS = [
  { id: 'slate', label: 'Slate', accent: 'rgba(255,255,255,0.42)', background: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.14)' },
  { id: 'cyan', label: 'Cyan', accent: 'rgba(125,211,252,0.68)', background: 'rgba(14,165,233,0.08)', border: 'rgba(125,211,252,0.22)' },
  { id: 'violet', label: 'Violet', accent: 'rgba(196,181,253,0.68)', background: 'rgba(139,92,246,0.08)', border: 'rgba(196,181,253,0.22)' },
  { id: 'emerald', label: 'Emerald', accent: 'rgba(110,231,183,0.68)', background: 'rgba(16,185,129,0.075)', border: 'rgba(110,231,183,0.2)' },
  { id: 'amber', label: 'Amber', accent: 'rgba(252,211,77,0.68)', background: 'rgba(245,158,11,0.075)', border: 'rgba(252,211,77,0.2)' },
  { id: 'rose', label: 'Rose', accent: 'rgba(253,164,175,0.68)', background: 'rgba(244,63,94,0.075)', border: 'rgba(253,164,175,0.2)' },
];

export const GROUP_PADDING = 48;
export const GROUP_MIN_SIZE = { width: 220, height: 150 };
export const DEFAULT_NODE_SIZE = { width: 320, height: 200 };

export const getGroupColor = (colorId) =>
  GROUP_COLORS.find((color) => color.id === colorId) || GROUP_COLORS[0];

const cloneGroups = (groups = {}) => ({ ...(groups || {}) });

export const toFiniteNumber = (value, fallback) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : fallback;
  }

  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
};

export const getNodeSize = (node = {}) => {
  const rawWidth = node.width ?? node.measured?.width ?? node.style?.width ?? DEFAULT_NODE_SIZE.width;
  const rawHeight = node.height ?? node.measured?.height ?? node.style?.height ?? DEFAULT_NODE_SIZE.height;

  return {
    width: toFiniteNumber(rawWidth, DEFAULT_NODE_SIZE.width),
    height: toFiniteNumber(rawHeight, DEFAULT_NODE_SIZE.height),
  };
};

export const getNodeBounds = (node) => {
  const size = getNodeSize(node);
  const x = toFiniteNumber(node.position?.x, 0);
  const y = toFiniteNumber(node.position?.y, 0);

  return {
    x,
    y,
    width: size.width,
    height: size.height,
    right: x + size.width,
    bottom: y + size.height,
  };
};

export const getNodesBoundsWithPadding = (nodes = [], padding = GROUP_PADDING) => {
  if (!nodes.length) return null;

  const bounds = nodes.map(getNodeBounds);
  const left = Math.min(...bounds.map((bound) => bound.x));
  const top = Math.min(...bounds.map((bound) => bound.y));
  const right = Math.max(...bounds.map((bound) => bound.right));
  const bottom = Math.max(...bounds.map((bound) => bound.bottom));
  const x = left - padding;
  const y = top - padding;
  const width = Math.max(GROUP_MIN_SIZE.width, right - left + padding * 2);
  const height = Math.max(GROUP_MIN_SIZE.height, bottom - top + padding * 2);

  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height)
  ) {
    return null;
  }

  return {
    x,
    y,
    width,
    height,
  };
};

export const getSelectedNodesBounds = (nodes = []) =>
  getNodesBoundsWithPadding(nodes.filter((node) => node.selected), 0);

export const createGroupId = (groups = {}, reservedIds = new Set()) => {
  let index = Object.keys(groups || {}).length + 1;
  let id = `group-${Date.now()}-${index}`;
  while (groups[id] || reservedIds.has(id)) {
    index += 1;
    id = `group-${Date.now()}-${index}`;
  }
  return id;
};

export const createGroupState = ({ nodes = [], groups = {}, nodeIds = [] }) => {
  const ids = [...new Set(nodeIds)].filter(Boolean);
  if (ids.length < 2) return null;

  const idSet = new Set(ids);
  const targetNodes = nodes.filter((node) => idSet.has(node.id));
  if (targetNodes.length < 2) return null;

  const bounds = getNodesBoundsWithPadding(targetNodes);
  if (!bounds) return null;

  const reservedIds = new Set(nodes.map((node) => node.id));
  const id = createGroupId(groups, reservedIds);
  const color = GROUP_COLORS[Object.keys(groups || {}).length % GROUP_COLORS.length].id;
  const group = {
    id,
    name: `Group ${Object.keys(groups || {}).length + 1}`,
    color,
    position: { x: bounds.x, y: bounds.y },
    size: { width: bounds.width, height: bounds.height },
  };

  return {
    nodes: nodes.map((node) => (idSet.has(node.id) ? { ...node, groupId: id } : node)),
    groups: {
      ...cloneGroups(groups),
      [id]: group,
    },
    group,
  };
};

export const removeNodesFromGroupState = ({ nodes = [], groups = {}, nodeIds = [] }) => {
  const idSet = new Set(nodeIds);
  return {
    nodes: nodes.map((node) => (idSet.has(node.id) ? { ...node, groupId: undefined } : node)),
    groups: cloneGroups(groups),
  };
};

export const deleteGroupState = ({ nodes = [], groups = {}, groupId }) => {
  const nextGroups = cloneGroups(groups);
  delete nextGroups[groupId];

  return {
    nodes: nodes.map((node) => (node.groupId === groupId ? { ...node, groupId: undefined } : node)),
    groups: nextGroups,
  };
};

export const moveGroupState = ({ nodes = [], groups = {}, groupId, delta = { x: 0, y: 0 } }) => {
  const group = groups[groupId];
  if (!group) return { nodes, groups };

  return {
    nodes: nodes.map((node) =>
      node.groupId === groupId
        ? {
            ...node,
            position: {
              x: (node.position?.x ?? 0) + delta.x,
              y: (node.position?.y ?? 0) + delta.y,
            },
          }
        : node
    ),
    groups: {
      ...cloneGroups(groups),
      [groupId]: {
        ...group,
        position: {
          x: group.position.x + delta.x,
          y: group.position.y + delta.y,
        },
      },
    },
  };
};

export const resizeGroupState = ({ groups = {}, groupId, handle, delta = { x: 0, y: 0 } }) => {
  const group = groups[groupId];
  if (!group) return groups;

  let nextX = group.position.x;
  let nextY = group.position.y;
  let nextWidth = group.size.width;
  let nextHeight = group.size.height;

  if (handle.includes('w')) {
    nextX += delta.x;
    nextWidth -= delta.x;
  }
  if (handle.includes('e')) {
    nextWidth += delta.x;
  }
  if (handle.includes('n')) {
    nextY += delta.y;
    nextHeight -= delta.y;
  }
  if (handle.includes('s')) {
    nextHeight += delta.y;
  }

  if (nextWidth < GROUP_MIN_SIZE.width) {
    if (handle.includes('w')) nextX -= GROUP_MIN_SIZE.width - nextWidth;
    nextWidth = GROUP_MIN_SIZE.width;
  }

  if (nextHeight < GROUP_MIN_SIZE.height) {
    if (handle.includes('n')) nextY -= GROUP_MIN_SIZE.height - nextHeight;
    nextHeight = GROUP_MIN_SIZE.height;
  }

  return {
    ...cloneGroups(groups),
    [groupId]: {
      ...group,
      position: { x: nextX, y: nextY },
      size: { width: nextWidth, height: nextHeight },
    },
  };
};

export const updateGroupState = ({ groups = {}, groupId, patch = {} }) => {
  const group = groups[groupId];
  if (!group) return groups;
  return {
    ...cloneGroups(groups),
    [groupId]: {
      ...group,
      ...patch,
    },
  };
};

export const getNodeCenter = (node) => {
  const bounds = getNodeBounds(node);
  return {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };
};

export const isPointInsideGroup = (point, group) =>
  point.x >= group.position.x &&
  point.x <= group.position.x + group.size.width &&
  point.y >= group.position.y &&
  point.y <= group.position.y + group.size.height;

export const findContainingGroupId = (node, groups = {}) => {
  const center = getNodeCenter(node);
  const entries = Object.values(groups || {}).reverse();
  const group = entries.find((candidate) => isPointInsideGroup(center, candidate));
  return group?.id;
};

export const assignNodeToContainingGroupState = ({ nodes = [], groups = {}, nodeId }) => {
  const target = nodes.find((node) => node.id === nodeId);
  if (!target) return nodes;
  const nextGroupId = findContainingGroupId(target, groups);
  if ((target.groupId || undefined) === (nextGroupId || undefined)) return nodes;

  return nodes.map((node) =>
    node.id === nodeId ? { ...node, groupId: nextGroupId || undefined } : node
  );
};

export const updateNodeGroupByDropState = assignNodeToContainingGroupState;

const createLoadGroupId = (preferredId, usedIds) => {
  let nextId = preferredId || `group-${Date.now()}`;
  let suffix = 1;
  while (usedIds.has(nextId)) {
    nextId = `${preferredId || 'group'}-${suffix}`;
    suffix += 1;
  }
  usedIds.add(nextId);
  return nextId;
};

export const reconcileGroupsForLoad = (nodes = [], rawGroups = {}) => {
  const usedIds = new Set(nodes.map((node) => node.id));
  const idMap = new Map();
  const groups = {};

  for (const [key, rawGroup] of Object.entries(rawGroups || {})) {
    if (!rawGroup || typeof rawGroup !== 'object') continue;
    const originalId = rawGroup.id || key;
    const id = createLoadGroupId(originalId, usedIds);
    idMap.set(originalId, id);
    idMap.set(key, id);
    groups[id] = {
      id,
      name: rawGroup.name || 'Group',
      color: getGroupColor(rawGroup.color).id,
      position: {
        x: Number(rawGroup.position?.x) || 0,
        y: Number(rawGroup.position?.y) || 0,
      },
      size: {
        width: Math.max(GROUP_MIN_SIZE.width, Number(rawGroup.size?.width) || GROUP_MIN_SIZE.width),
        height: Math.max(GROUP_MIN_SIZE.height, Number(rawGroup.size?.height) || GROUP_MIN_SIZE.height),
      },
      ...(rawGroup.locked ? { locked: true } : {}),
    };
  }

  const nextNodes = nodes.map((node) => {
    if (!node.groupId) return node;
    const nextGroupId = idMap.get(node.groupId);
    return nextGroupId ? { ...node, groupId: nextGroupId } : { ...node, groupId: undefined };
  });

  return { nodes: nextNodes, groups };
};

export const normalizeLoadedGroups = reconcileGroupsForLoad;
