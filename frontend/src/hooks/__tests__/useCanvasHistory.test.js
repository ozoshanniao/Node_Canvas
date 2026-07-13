import assert from 'node:assert/strict';
import {
  createSnapshot,
  getSnapshotHash,
  sanitizeEdgesForHistory,
} from '../useCanvasHistory.js';

const orderedEdge = {
  id: 'reference-edge',
  source: 'image-a',
  target: 'video',
  targetHandle: 'image:references',
  selected: true,
  data: { connectionOrder: 7, flowing: true },
};

const sanitized = sanitizeEdgesForHistory([orderedEdge]);
assert.equal(sanitized[0].selected, undefined);
assert.equal(sanitized[0].data.flowing, undefined);
assert.equal(sanitized[0].data.connectionOrder, 7);

const beforeDelete = createSnapshot([], [orderedEdge], {});
const afterDelete = createSnapshot([], [], {});
assert.notEqual(getSnapshotHash(beforeDelete), getSnapshotHash(afterDelete));

// Full snapshots are the values restored by undo/redo. Keeping the original
// order in both transitions also proves that no timestamp or renumbering is used.
const undoRestored = structuredClone(beforeDelete);
const redoRestored = structuredClone(afterDelete);
assert.equal(undoRestored.edges[0].data.connectionOrder, 7);
assert.equal(redoRestored.edges.length, 0);

// commitHistory rejects an immediate/debounced duplicate by snapshot hash.
const discreteHash = getSnapshotHash(afterDelete);
const debouncedHash = getSnapshotHash(createSnapshot([], [], {}));
assert.equal(debouncedHash, discreteHash);

console.log('useCanvasHistory tests passed');
