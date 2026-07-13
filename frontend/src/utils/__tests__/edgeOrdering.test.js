import assert from 'node:assert/strict';
import {
  appendEdgesWithConnectionOrder,
  assignConnectionOrder,
  assignReconnectedConnectionOrder,
  getCanonicalInputEdges,
  getInputConnectionLimit,
  isConnectionAllowed,
  migrateLegacyConnectionOrders,
  validateInputCardinality,
} from '../edgeOrdering.js';
import { getDerivedImageInputEdgeLabel } from '../edgeLabels.js';

const edge = (id, source, target, targetHandle, connectionOrder) => ({
  id,
  source,
  sourceHandle: 'image:out',
  target,
  targetHandle,
  data: connectionOrder === undefined ? {} : { connectionOrder },
});

{
  const existing = [edge('a', 'source-a', 'target', 'image:references', 0)];
  const assigned = assignConnectionOrder(edge('b', 'source-b', 'target', 'image:references'), existing);
  assert.equal(assigned.data.connectionOrder, 1);
  assert.equal(existing[0].data.connectionOrder, 0);
}

{
  const existing = [
    edge('same-group', 'a', 'target', 'image:references', 3),
    edge('other-target', 'b', 'other', 'image:references', 40),
    edge('other-handle', 'c', 'target', 'image:firstFrame', 20),
  ];
  assert.equal(
    assignConnectionOrder(edge('new-target', 'd', 'target', 'image:references'), existing).data.connectionOrder,
    4,
    'different targets and handles must not affect allocation'
  );
  assert.equal(
    assignConnectionOrder(edge('new-other', 'd', 'other', 'image:references'), existing).data.connectionOrder,
    41
  );
}

{
  const aliasEdges = [
    edge('alias-second', 'b', 'target', 'image:references[]', 2),
    edge('alias-first', 'a', 'target', 'image:references', 1),
  ];
  assert.deepEqual(
    getCanonicalInputEdges({ edges: aliasEdges, targetNodeId: 'target', targetHandle: 'image:references' })
      .map((item) => item.id),
    ['alias-first', 'alias-second']
  );
}

{
  const edges = [
    edge('third', 'source-c', 'target', 'image:references', 9),
    edge('first', 'source-a', 'target', 'image:references', 2),
    edge('other-handle', 'source-x', 'target', 'image:firstFrame', 0),
    edge('other-target', 'source-y', 'other', 'image:references', 0),
    edge('second', 'source-b', 'target', 'image:references', 5),
  ];
  const snapshot = structuredClone(edges);
  assert.deepEqual(
    getCanonicalInputEdges({ edges, targetNodeId: 'target', targetHandle: 'image:references' }).map((item) => item.id),
    ['first', 'second', 'third']
  );
  assert.deepEqual(edges, snapshot, 'selector must not mutate input edges');
}

{
  const duplicateSourceEdges = [
    edge('one', 'same-source', 'target', 'image:references', 0),
    edge('two', 'same-source', 'target', 'image:references', 1),
  ];
  assert.equal(
    getCanonicalInputEdges({ edges: duplicateSourceEdges, targetNodeId: 'target', targetHandle: 'image:references' }).length,
    2,
    'duplicate source edges must be preserved'
  );
}

{
  const legacy = [
    edge('z', 'source-z', 'target', 'image:references'),
    edge('a', 'source-a', 'target', 'image:references'),
  ];
  assert.deepEqual(
    getCanonicalInputEdges({ edges: legacy, targetNodeId: 'target', targetHandle: 'image:references' }).map((item) => item.id),
    ['z', 'a'],
    'legacy array position must win before edge id'
  );
  const migrated = migrateLegacyConnectionOrders(legacy);
  assert.deepEqual(migrated.map((item) => item.data.connectionOrder), [0, 1]);
}

{
  const colliding = [
    edge('b', 'source-b', 'target', 'image:references', 4),
    edge('a', 'source-a', 'target', 'image:references', 4),
  ];
  assert.deepEqual(
    getCanonicalInputEdges({ edges: colliding, targetNodeId: 'target', targetHandle: 'image:references' }).map((item) => item.id),
    ['b', 'a']
  );
  assert.deepEqual(migrateLegacyConnectionOrders(colliding).map((item) => item.data.connectionOrder), [0, 1]);
}

{
  const current = [edge('current', 'source-current', 'target', 'image:references', 7)];
  const pasted = [
    edge('paste-second', 'source-b', 'target', 'image:references', 4),
    edge('paste-first', 'source-a', 'target', 'image:references', 2),
  ];
  const appended = appendEdgesWithConnectionOrder(current, pasted);
  const canonical = getCanonicalInputEdges({ edges: appended, targetNodeId: 'target', targetHandle: 'image:references' });
  assert.deepEqual(canonical.map((item) => item.id), ['current', 'paste-first', 'paste-second']);
  assert.deepEqual(canonical.map((item) => item.data.connectionOrder), [7, 8, 9]);
}

{
  const inputEdges = [
    edge('one', 'source-a', 'target', 'image:references', 0),
    edge('two', 'source-b', 'target', 'image:references', 1),
    edge('three', 'source-c', 'target', 'image:references', 2),
  ];
  const afterDelete = inputEdges.filter((item) => item.id !== 'two');
  assert.equal(getDerivedImageInputEdgeLabel(afterDelete[0], afterDelete), 'image1');
  assert.equal(getDerivedImageInputEdgeLabel(afterDelete[1], afterDelete), 'image2');
  assert.deepEqual(afterDelete.map((item) => item.data.connectionOrder), [0, 2]);
  assert.equal(getDerivedImageInputEdgeLabel(edge('first', 'a', 'target', 'image:firstFrame', 8), []), 'image1');
  assert.equal(getDerivedImageInputEdgeLabel(edge('last', 'b', 'target', 'image:lastFrame', 1), []), 'image2');
}

{
  const oldEdge = edge('reconnect', 'source-a', 'target', 'image:references', 6);
  const sameGroup = assignReconnectedConnectionOrder({
    oldEdge,
    reconnectedEdge: { ...oldEdge, source: 'source-b', data: { ...oldEdge.data, inputLabel: 'old' } },
    existingEdges: [edge('existing', 'source-c', 'target', 'image:references', 9)],
  });
  assert.equal(sameGroup.data.connectionOrder, 6);
  assert.equal(sameGroup.data.inputLabel, undefined);

  const movedGroup = assignReconnectedConnectionOrder({
    oldEdge,
    reconnectedEdge: { ...oldEdge, target: 'other-target', targetHandle: 'image:references' },
    existingEdges: [edge('other-existing', 'source-c', 'other-target', 'image:references', 4)],
  });
  assert.equal(movedGroup.data.connectionOrder, 5);
}

{
  const targetNode = {
    id: 'target',
    data: {
      schemaSnapshot: {
        inputCapabilities: {
          'image:references': { metadata: { maxItems: 2 } },
        },
      },
    },
  };
  assert.equal(getInputConnectionLimit({ targetNode, targetHandle: 'image:firstFrame' }), 1);
  assert.equal(getInputConnectionLimit({ targetNode, targetHandle: 'image:references' }), 2);
  const referenceEdges = [
    edge('one', 'a', 'target', 'image:references', 0),
    edge('two', 'b', 'target', 'image:references', 1),
  ];
  assert.equal(validateInputCardinality({ edges: referenceEdges, targetNode, targetHandle: 'image:references' }).isValid, true);
  assert.equal(isConnectionAllowed({
    connection: { source: 'c', sourceHandle: 'image:out', target: 'target', targetHandle: 'image:references' },
    edges: referenceEdges,
    nodes: [targetNode],
  }), false);
  assert.equal(isConnectionAllowed({
    connection: { source: 'b', sourceHandle: 'image:out', target: 'target', targetHandle: 'image:firstFrame' },
    edges: [edge('first', 'a', 'target', 'image:firstFrame', 0)],
    nodes: [targetNode],
  }), false);
  assert.equal(isConnectionAllowed({
    connection: { source: 'a', sourceHandle: 'image:out', target: 'target', targetHandle: 'image:firstFrame' },
    edges: [],
    nodes: [targetNode],
  }), true);
  assert.equal(isConnectionAllowed({
    connection: { source: 'b', sourceHandle: 'image:out', target: 'target', targetHandle: 'image:lastFrame' },
    edges: [edge('last', 'a', 'target', 'image:lastFrame', 0)],
    nodes: [targetNode],
  }), false);
  assert.equal(isConnectionAllowed({
    connection: { source: 'b', sourceHandle: 'image:out', target: 'target', targetHandle: 'image:lastFrame' },
    edges: [],
    nodes: [targetNode],
  }), true);
}

console.log('edgeOrdering tests passed');
