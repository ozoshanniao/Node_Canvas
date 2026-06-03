import assert from 'node:assert/strict';
import {
  EASE_CURVE_PRESET_IMAGE_DIR,
  EASING_PRESET_OPTIONS,
  getEasingPresetHandles,
  getEasingPresetImagePath,
  normalizeEasingPresetId,
} from '../easingPresets.js';

assert.equal(EASING_PRESET_OPTIONS.length, 14);

const ids = new Set();
for (const preset of EASING_PRESET_OPTIONS) {
  assert.equal(typeof preset.id, 'string');
  assert.equal(typeof preset.label, 'string');
  assert.equal(ids.has(preset.id), false);
  ids.add(preset.id);
  assert.equal(Array.isArray(preset.handles), true);
  assert.equal(preset.handles.length, 4);
  assert.equal(preset.handles.every((value) => Number.isFinite(value)), true);
  assert.equal(preset.image, `${EASE_CURVE_PRESET_IMAGE_DIR}/${preset.id}.png`);
  assert.equal(getEasingPresetImagePath(preset.id), preset.image);
  const handles = getEasingPresetHandles(preset.id);
  assert.equal(Number.isFinite(handles.x1), true);
  assert.equal(Number.isFinite(handles.y1), true);
  assert.equal(Number.isFinite(handles.x2), true);
  assert.equal(Number.isFinite(handles.y2), true);
}

assert.equal(normalizeEasingPresetId('easeInOut'), 'ease-in-out');
assert.equal(normalizeEasingPresetId('easeIn'), 'ease-in');
assert.equal(normalizeEasingPresetId('missing'), null);

console.log('easingPresets tests passed');
