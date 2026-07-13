import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { removeEdgesByIds, stopEdgeActionEvent } from '../edgeActions.js';
import { getImageEdgeUiVisibility } from '../edgeLabels.js';

const imageVisibility = (state = {}) => getImageEdgeUiVisibility({
  selected: false,
  sourceSelected: false,
  targetSelected: false,
  targetHandle: 'image:references',
  inputLabel: 'image1',
  ...state,
});

assert.deepEqual(imageVisibility(), {
  showImageLabel: false,
  showDeleteControl: false,
});
assert.deepEqual(imageVisibility({ selected: true }), {
  showImageLabel: true,
  showDeleteControl: true,
});
assert.deepEqual(imageVisibility({ sourceSelected: true }), {
  showImageLabel: true,
  showDeleteControl: false,
});
assert.deepEqual(imageVisibility({ targetSelected: true }), {
  showImageLabel: true,
  showDeleteControl: false,
});
assert.deepEqual(imageVisibility({ sourceSelected: true, targetSelected: true }), {
  showImageLabel: true,
  showDeleteControl: false,
});
assert.deepEqual(imageVisibility({ selected: true, sourceSelected: true }), {
  showImageLabel: true,
  showDeleteControl: true,
});

// A multi-node box selection produces the same node-selected state on every related edge.
[
  imageVisibility({ sourceSelected: true }),
  imageVisibility({ targetSelected: true }),
].forEach((visibility) => {
  assert.equal(visibility.showImageLabel, true);
  assert.equal(visibility.showDeleteControl, false);
});

assert.deepEqual(imageVisibility({
  selected: true,
  targetHandle: 'text:prompt',
  inputLabel: 'prompt',
}), {
  showImageLabel: false,
  showDeleteControl: true,
});
assert.deepEqual(imageVisibility({
  targetSelected: true,
  targetHandle: 'image:end',
  inputLabel: 'END',
}), {
  showImageLabel: true,
  showDeleteControl: false,
});
assert.equal(imageVisibility({
  targetSelected: true,
  inputLabel: 'custom-label',
}).showImageLabel, false);

{
  let prevented = 0;
  let stopped = 0;
  stopEdgeActionEvent({
    preventDefault: () => { prevented += 1; },
    stopPropagation: () => { stopped += 1; },
  });
  assert.equal(prevented, 1);
  assert.equal(stopped, 1);
}

{
  const edges = [
    { id: 'one', data: { connectionOrder: 0 } },
    { id: 'two', data: { connectionOrder: 2 } },
  ];
  const nextEdges = removeEdgesByIds(edges, ['one']);
  assert.deepEqual(nextEdges, [{ id: 'two', data: { connectionOrder: 2 } }]);
  assert.equal(removeEdgesByIds(edges, ['missing']), edges);
}

// The project has no JSX DOM test runtime, so enforce the SVG-local structure as a source contract.
{
  const imageEdgeSource = readFileSync(
    new URL('../../components/ImageEdge.jsx', import.meta.url),
    'utf8'
  );
  const toolbarSource = readFileSync(
    new URL('../../components/EdgeActionToolbar.jsx', import.meta.url),
    'utf8'
  );
  const canvasCss = readFileSync(new URL('../../index.css', import.meta.url), 'utf8');
  const localUiStart = imageEdgeSource.indexOf('<foreignObject');
  const localUiEnd = imageEdgeSource.indexOf('</foreignObject>', localUiStart);
  const contentPosition = imageEdgeSource.indexOf('data-edge-local-content', localUiStart);
  const labelSlotPosition = imageEdgeSource.indexOf('data-edge-local-label-slot', localUiStart);
  const labelPosition = imageEdgeSource.indexOf('data-edge-image-label', localUiStart);
  const toolbarPosition = imageEdgeSource.indexOf('<EdgeActionToolbar', localUiStart);
  const balanceSlotPosition = imageEdgeSource.indexOf('data-edge-local-balance-slot', localUiStart);

  assert.equal(localUiStart >= 0, true, 'ImageEdge must render an SVG-local foreignObject');
  assert.equal(localUiEnd > localUiStart, true);
  assert.equal(contentPosition > localUiStart && contentPosition < localUiEnd, true);
  assert.equal(labelSlotPosition > contentPosition && labelSlotPosition < labelPosition, true);
  assert.equal(labelPosition > localUiStart && labelPosition < toolbarPosition, true);
  assert.equal(toolbarPosition > labelPosition && toolbarPosition < balanceSlotPosition, true);
  assert.equal(balanceSlotPosition > toolbarPosition && balanceSlotPosition < localUiEnd, true);
  assert.equal(imageEdgeSource.includes('className="flex w-full h-full items-center justify-center gap-1 box-border pointer-events-none"'), true);
  assert.equal(imageEdgeSource.includes("'flex flex-1 min-w-0 items-center justify-end pointer-events-none'"), true);
  assert.equal(imageEdgeSource.includes('data-edge-local-balance-slot="true"'), true);
  assert.equal(imageEdgeSource.includes('className="flex-1 min-w-0 pointer-events-none"'), true);
  assert.equal(imageEdgeSource.includes(' pl-6'), false);
  assert.equal(imageEdgeSource.includes('className="pointer-events-none inline-flex flex-none items-center justify-center box-border leading-none'), true);
  assert.equal(imageEdgeSource.includes('overflow="visible"'), true);
  assert.equal(imageEdgeSource.includes('const localUiX = labelX;'), true);
  assert.equal(imageEdgeSource.includes('const localUiY = labelY;'), true);
  assert.equal(imageEdgeSource.includes('labelX * 0.6 + sourceX * 0.4'), false);
  assert.equal(imageEdgeSource.includes('labelY * 0.6 + sourceY * 0.4'), false);
  assert.equal(toolbarSource.includes('pointer-events-auto inline-flex w-5 h-5 flex-none items-center justify-center box-border p-0 m-0 leading-none'), true);
  assert.equal(toolbarSource.includes('className="block w-2.5 h-2.5 flex-none"'), true);
  assert.equal(toolbarSource.includes('absolute'), false);
  assert.equal(toolbarSource.includes('transform'), false);
  assert.equal(imageEdgeSource.includes('EdgeLabelRenderer'), false);
  assert.equal(toolbarSource.includes('EdgeLabelRenderer'), false);
  assert.equal(imageEdgeSource.includes("position: 'fixed'"), false);
  assert.equal(toolbarSource.includes("position: 'fixed'"), false);
  assert.equal(imageEdgeSource.includes('zIndex'), false);
  assert.equal(toolbarSource.includes('zIndex'), false);
  assert.equal(imageEdgeSource.includes('document.addEventListener'), false);
  assert.equal(imageEdgeSource.includes('querySelector'), false);
  assert.equal(toolbarSource.includes('document.addEventListener'), false);
  assert.equal(toolbarSource.includes('querySelector'), false);
  assert.equal(imageEdgeSource.includes('pointer-events-none'), true);
  assert.equal(toolbarSource.includes('pointer-events-auto'), true);
  assert.equal(toolbarSource.includes('nodrag nopan'), true);
  assert.equal(canvasCss.includes('.react-flow__edge-labels'), false);
  assert.equal(canvasCss.includes('.react-flow__edgelabel-renderer'), false);
}

console.log('edgeActions tests passed');
