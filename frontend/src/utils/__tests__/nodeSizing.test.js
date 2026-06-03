import assert from 'node:assert/strict';
import {
  DEFAULT_VIDEO_INPUT_ASPECT_RATIO,
  DEFAULT_VIDEO_INPUT_SIZE,
  getAspectRatioFromDimensions,
  getVideoInputNodeAspectRatio,
  getVideoInputNodeSizeByAspectRatio,
} from '../nodeSizing.js';

assert.equal(DEFAULT_VIDEO_INPUT_ASPECT_RATIO, '16:9');
assert.deepEqual(DEFAULT_VIDEO_INPUT_SIZE, { width: 360, height: 203 });

assert.equal(getAspectRatioFromDimensions(1920, 1080), '16:9');
assert.equal(getAspectRatioFromDimensions(1080, 1920), '9:16');
assert.equal(getAspectRatioFromDimensions(Number.NaN, 1080), '16:9');
assert.equal(getAspectRatioFromDimensions(0, 1080), '16:9');

assert.equal(getVideoInputNodeAspectRatio({ naturalWidth: 1920, naturalHeight: 1080 }), '16:9');
assert.equal(getVideoInputNodeAspectRatio({ naturalWidth: 1080, naturalHeight: 1920 }), '9:16');
assert.equal(getVideoInputNodeAspectRatio({ aspectRatio: '4:3', naturalWidth: 1920, naturalHeight: 1080 }), '4:3');
assert.equal(getVideoInputNodeAspectRatio({}), '16:9');

const defaultSize = getVideoInputNodeSizeByAspectRatio('16:9');
assert.equal(defaultSize.width, 360);
assert.equal(defaultSize.height, 203);
assert.equal(Number.isFinite(defaultSize.width), true);
assert.equal(Number.isFinite(defaultSize.height), true);

const wideResize = getVideoInputNodeSizeByAspectRatio('16:9', { width: 480 });
assert.deepEqual(wideResize, { width: 480, height: 270 });

const portraitResize = getVideoInputNodeSizeByAspectRatio('9:16', { width: 360 });
assert.deepEqual(portraitResize, { width: 220, height: 391 });

const invalidResize = getVideoInputNodeSizeByAspectRatio('bad:value', { width: Number.NaN });
assert.equal(Number.isFinite(invalidResize.width), true);
assert.equal(Number.isFinite(invalidResize.height), true);

console.log('nodeSizing tests passed');
