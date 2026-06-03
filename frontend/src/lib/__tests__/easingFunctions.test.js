import assert from 'node:assert/strict';
import { createBezierEasing, generateEasingPolyline, normalizeBezierHandles, sampleBezier } from '../easingFunctions.js';

assert.deepEqual(normalizeBezierHandles({ x1: -1, y1: 2, x2: '0.5', y2: Number.NaN }), {
  x1: 0,
  y1: 1,
  x2: 0.5,
  y2: 0,
});

assert.equal(sampleBezier({ x1: 0, y1: 0, x2: 1, y2: 1 }, 0), 0);
assert.equal(sampleBezier({ x1: 0, y1: 0, x2: 1, y2: 1 }, 1), 1);

const easing = createBezierEasing({ x1: 0.42, y1: 0, x2: 0.58, y2: 1 });
for (let i = 0; i <= 20; i += 1) {
  const value = easing(i / 20);
  assert.equal(Number.isFinite(value), true);
  assert.equal(value >= 0 && value <= 1, true);
}

const polyline = generateEasingPolyline({ x1: 0.25, y1: 0.1, x2: 0.25, y2: 1 }, 8);
assert.equal(polyline.length, 8);
assert.equal(polyline.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y)), true);

console.log('easingFunctions tests passed');
