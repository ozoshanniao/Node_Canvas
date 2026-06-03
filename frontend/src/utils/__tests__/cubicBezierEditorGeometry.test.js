import assert from 'node:assert/strict';
import {
  getBezierPointFromClientRect,
  getBezierPointPixelPosition,
  isFiniteRectSize,
  toPlotPoint,
  toSvgPoint,
} from '../cubicBezierEditorGeometry.js';

assert.equal(isFiniteRectSize({ width: 0, height: 100 }), false);
assert.equal(isFiniteRectSize({ width: 100, height: Number.NaN }), false);
assert.equal(isFiniteRectSize({ width: 100, height: 80 }), true);

assert.equal(getBezierPointPixelPosition({ x: 0.5, y: 0.25 }, { width: 0, height: 80 }), null);
assert.deepEqual(getBezierPointPixelPosition({ x: 0.5, y: 0.25 }, { width: 200, height: 100 }), {
  left: 100,
  top: 75,
});

{
  const layoutSize = { width: 300, height: 300 };
  assert.deepEqual(getBezierPointPixelPosition({ x: 0.25, y: 0.1 }, layoutSize), {
    left: 75,
    top: 270,
  });
  assert.deepEqual(toPlotPoint({ x: 0.25, y: 0.1 }, layoutSize), {
    left: 75,
    top: 270,
  });
  assert.deepEqual(toSvgPoint({ x: 0.25, y: 0.1 }), {
    x: 25,
    y: 90,
  });
  assert.deepEqual(getBezierPointPixelPosition({ x: 0.25, y: 1 }, layoutSize), {
    left: 75,
    top: 0,
  });
}

assert.deepEqual(
  getBezierPointFromClientRect(
    { clientX: 110, clientY: 60 },
    { left: 10, top: 10, width: 200, height: 100 }
  ),
  { x: 0.5, y: 0.5 }
);
assert.deepEqual(
  getBezierPointFromClientRect(
    { clientX: 75, clientY: 0 },
    { left: 0, top: 0, width: 150, height: 150 }
  ),
  { x: 0.5, y: 1 }
);
assert.deepEqual(
  getBezierPointFromClientRect(
    { clientX: 75, clientY: 150 },
    { left: 0, top: 0, width: 150, height: 150 }
  ),
  { x: 0.5, y: 0 }
);
assert.deepEqual(
  getBezierPointFromClientRect(
    { clientX: -10, clientY: 200 },
    { left: 10, top: 10, width: 200, height: 100 }
  ),
  { x: 0, y: 0 }
);
assert.equal(getBezierPointFromClientRect({ clientX: 0, clientY: 0 }, { left: 0, top: 0, width: 0, height: 0 }), null);

console.log('cubicBezierEditorGeometry tests passed');
