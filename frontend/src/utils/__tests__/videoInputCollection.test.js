import assert from 'node:assert/strict';
import {
  collectVideoImageHandle,
  getReferenceImageLimitError,
  validateVideoInputHandles,
} from '../videoInputCollection.js';

const nodes = [
  { id: 'a', type: 'imageInputNode', data: { url: 'a.png' } },
  { id: 'b', type: 'imageInputNode', data: { url: 'b.png' } },
  { id: 'empty', type: 'imageInputNode', data: {} },
  { id: 'video', type: 'videoNode', data: {} },
];
const edges = [
  { id: 'b-edge', source: 'b', sourceHandle: 'image:out', target: 'video', targetHandle: 'image:references', data: { connectionOrder: 5 } },
  { id: 'a-edge', source: 'a', sourceHandle: 'image:out', target: 'video', targetHandle: 'image:references', data: { connectionOrder: 2 } },
  { id: 'a-repeat', source: 'a', sourceHandle: 'image:out', target: 'video', targetHandle: 'image:references', data: { connectionOrder: 8 } },
];

assert.deepEqual(
  collectVideoImageHandle({ targetNodeId: 'video', targetHandle: 'image:references', edges, nodes }).images,
  ['a.png', 'b.png', 'a.png'],
  'video image payload must follow canonical order and preserve duplicate sources'
);

{
  const missing = collectVideoImageHandle({
    targetNodeId: 'video',
    targetHandle: 'image:firstFrame',
    edges: [{ id: 'missing', source: 'empty', sourceHandle: 'image:out', target: 'video', targetHandle: 'image:firstFrame', data: { connectionOrder: 0 } }],
    nodes,
  });
  assert.equal(missing.errors[0], 'Image input image1 has no usable image.');
}

{
  const invalidFrameEdges = [
    { id: 'one', source: 'a', sourceHandle: 'image:out', target: 'video', targetHandle: 'image:firstFrame', data: { connectionOrder: 0 } },
    { id: 'two', source: 'b', sourceHandle: 'image:out', target: 'video', targetHandle: 'image:firstFrame', data: { connectionOrder: 1 } },
  ];
  assert.equal(validateVideoInputHandles({
    targetNodeId: 'video',
    handles: ['image:firstFrame'],
    edges: invalidFrameEdges,
    nodes,
  }).length, 1);
}

assert.equal(getReferenceImageLimitError(['a', 'b'], 1).includes('at most 1'), true);
assert.equal(getReferenceImageLimitError(['a'], 1), '');

console.log('videoInputCollection tests passed');
