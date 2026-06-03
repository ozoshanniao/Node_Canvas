import assert from 'node:assert/strict';
import {
  assignNodeToContainingGroupState,
  createGroupState,
  deleteGroupState,
  getNodeSize,
  getNodesBoundsWithPadding,
  moveGroupState,
  normalizeLoadedGroups,
  reconcileGroupsForLoad,
  removeNodesFromGroupState,
  resizeGroupState,
  updateNodeGroupByDropState,
} from '../groupBoxes.js';

const baseNodes = [
  { id: 'a', type: 'textNode', position: { x: 100, y: 100 }, width: 120, height: 80, data: {} },
  { id: 'b', type: 'textNode', position: { x: 300, y: 160 }, width: 140, height: 90, data: {} },
  { id: 'c', type: 'textNode', position: { x: 800, y: 800 }, width: 100, height: 100, data: {} },
];

assert.deepEqual(
  getNodeSize({ style: { width: '120px', height: '80px' } }),
  { width: 120, height: 80 }
);
assert.deepEqual(
  getNodeSize({ width: Number.NaN, height: Number.NaN, style: { width: '120px', height: '80px' } }),
  { width: 320, height: 200 }
);
assert.deepEqual(
  getNodeSize({ style: { width: 'auto', height: 'auto' } }),
  { width: 320, height: 200 }
);
assert.deepEqual(getNodeSize({}), { width: 320, height: 200 });

const stringSizeBounds = getNodesBoundsWithPadding(
  [{ id: 'px', position: { x: 10, y: 20 }, style: { width: '120px', height: '80px' } }],
  0
);
assert.equal(Number.isFinite(stringSizeBounds.x), true);
assert.equal(Number.isFinite(stringSizeBounds.y), true);
assert.equal(Number.isFinite(stringSizeBounds.width), true);
assert.equal(Number.isFinite(stringSizeBounds.height), true);

const nanSizeBounds = getNodesBoundsWithPadding(
  [{ id: 'nan', position: { x: 10, y: 20 }, width: Number.NaN, height: Number.NaN }],
  0
);
assert.equal(Number.isFinite(nanSizeBounds.x), true);
assert.equal(Number.isFinite(nanSizeBounds.y), true);
assert.equal(Number.isFinite(nanSizeBounds.width), true);
assert.equal(Number.isFinite(nanSizeBounds.height), true);

assert.equal(
  getNodesBoundsWithPadding([{ id: 'bad-padding', position: { x: 0, y: 0 }, width: 100, height: 100 }], Number.NaN),
  null
);

const originalDateNow = Date.now;
Date.now = () => 123;
const conflictChecked = createGroupState({
  nodes: [
    ...baseNodes,
    { id: 'group-123-1', type: 'textNode', position: { x: 0, y: 0 }, width: 100, height: 100, data: {} },
  ],
  groups: {},
  nodeIds: ['a', 'b'],
});
Date.now = originalDateNow;
assert.notEqual(conflictChecked.group.id, 'group-123-1');

const created = createGroupState({ nodes: baseNodes, groups: {}, nodeIds: ['a', 'b'] });
assert.ok(created);
assert.equal(Object.keys(created.groups).length, 1);
assert.equal(created.nodes.find((node) => node.id === 'a').groupId, created.group.id);
assert.deepEqual(created.nodes.find((node) => node.id === 'a').position, baseNodes[0].position);
assert.deepEqual(created.nodes.find((node) => node.id === 'b').position, baseNodes[1].position);

const preciseSelection = createGroupState({
  nodes: [
    { ...baseNodes[0], groupId: 'existing-group' },
    { ...baseNodes[1], groupId: 'existing-group' },
    { ...baseNodes[2], groupId: 'existing-group' },
  ],
  groups: {
    'existing-group': {
      id: 'existing-group',
      name: 'Existing',
      color: 'slate',
      position: { x: 0, y: 0 },
      size: { width: 1000, height: 1000 },
    },
  },
  nodeIds: ['a', 'b'],
});
assert.equal(preciseSelection.nodes.find((node) => node.id === 'a').groupId, preciseSelection.group.id);
assert.equal(preciseSelection.nodes.find((node) => node.id === 'b').groupId, preciseSelection.group.id);
assert.equal(preciseSelection.nodes.find((node) => node.id === 'c').groupId, 'existing-group');

const moved = moveGroupState({
  nodes: created.nodes,
  groups: created.groups,
  groupId: created.group.id,
  delta: { x: 40, y: -20 },
});
assert.deepEqual(moved.groups[created.group.id].position, {
  x: created.group.position.x + 40,
  y: created.group.position.y - 20,
});
assert.deepEqual(moved.nodes.find((node) => node.id === 'a').position, { x: 140, y: 80 });
assert.deepEqual(moved.nodes.find((node) => node.id === 'c').position, baseNodes[2].position);

const resizedGroups = resizeGroupState({
  groups: moved.groups,
  groupId: created.group.id,
  handle: 'se',
  delta: { x: 60, y: 70 },
});
assert.equal(resizedGroups[created.group.id].size.width, moved.groups[created.group.id].size.width + 60);
assert.equal(resizedGroups[created.group.id].size.height, moved.groups[created.group.id].size.height + 70);
assert.deepEqual(moved.nodes.find((node) => node.id === 'a').position, { x: 140, y: 80 });

const removed = removeNodesFromGroupState({
  nodes: created.nodes,
  groups: created.groups,
  nodeIds: ['a', 'b'],
});
assert.equal(removed.nodes.find((node) => node.id === 'a').groupId, undefined);
assert.equal(Object.keys(removed.groups).length, 1);

const deleted = deleteGroupState({ nodes: created.nodes, groups: created.groups, groupId: created.group.id });
assert.equal(Object.keys(deleted.groups).length, 0);
assert.equal(deleted.nodes.find((node) => node.id === 'b').groupId, undefined);

const draggedOut = assignNodeToContainingGroupState({
  nodes: [{ ...created.nodes[0], position: { x: 900, y: 900 } }],
  groups: created.groups,
  nodeId: 'a',
});
assert.equal(draggedOut[0].groupId, undefined);

const draggedIn = assignNodeToContainingGroupState({
  nodes: [{ ...baseNodes[2], position: created.group.position }],
  groups: created.groups,
  nodeId: 'c',
});
assert.equal(draggedIn[0].groupId, created.group.id);

const topGroupId = 'group-top';
const overlapped = updateNodeGroupByDropState({
  nodes: [{ ...baseNodes[2], position: { x: 0, y: 0 } }],
  groups: {
    'group-bottom': {
      id: 'group-bottom',
      name: 'Bottom',
      color: 'slate',
      position: { x: -100, y: -100 },
      size: { width: 300, height: 300 },
    },
    [topGroupId]: {
      id: topGroupId,
      name: 'Top',
      color: 'cyan',
      position: { x: -50, y: -50 },
      size: { width: 300, height: 300 },
    },
  },
  nodeId: 'c',
});
assert.equal(overlapped[0].groupId, topGroupId);

const reconciled = reconcileGroupsForLoad(
  [{ id: 'group-1', type: 'textNode', position: { x: 0, y: 0 }, data: {}, groupId: 'group-1' }],
  {
    'group-1': {
      id: 'group-1',
      name: 'Loaded',
      color: 'cyan',
      position: { x: 10, y: 20 },
      size: { width: 300, height: 220 },
    },
  }
);
const reconciledGroupId = Object.keys(reconciled.groups)[0];
assert.notEqual(reconciledGroupId, 'group-1');
assert.equal(reconciled.nodes[0].groupId, reconciledGroupId);

const normalized = normalizeLoadedGroups(
  [
    { id: 'orphan', type: 'textNode', position: { x: 0, y: 0 }, data: {}, groupId: 'missing-group' },
    { id: 'plain', type: 'textNode', position: { x: 0, y: 0 }, data: {} },
  ],
  {}
);
assert.deepEqual(normalized.groups, {});
assert.equal(normalized.nodes.find((node) => node.id === 'orphan').groupId, undefined);
assert.equal(normalized.nodes.find((node) => node.id === 'plain').groupId, undefined);

console.log('groupBoxes tests passed');
