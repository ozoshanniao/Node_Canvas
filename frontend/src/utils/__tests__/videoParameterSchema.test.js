import assert from 'node:assert/strict';
import {
  coerceParameterValue,
  getAdvancedParameters,
  getBasicParameters,
  getParameterDefaultValue,
  getParametersByGroup,
  isParameterHidden,
  isParameterVisible,
} from '../videoParameterSchema.js';

const capability = {
  parameters: {
    aspectRatio: { type: 'select', group: 'basic', options: ['16:9'], default: '16:9' },
    negativePrompt: { type: 'text', group: 'advanced', default: '' },
    cfgScale: { type: 'number', group: 'advanced', default: 0.5 },
    returnLastFrame: { type: 'boolean', group: 'advanced', default: false },
    generateAudio: { type: 'boolean', group: 'advanced', default: true },
    seed: { type: 'integer', group: 'advanced', default: -1 },
    watermark: { type: 'boolean', group: 'hidden', default: false },
    deprecatedParam: { type: 'text', group: 'advanced', deprecated: true, default: '' },
  },
  quickParams: ['aspectRatio'],
  advancedParams: ['cfgScale', 'negativePrompt', 'returnLastFrame', 'generateAudio', 'seed', 'deprecatedParam'],
};

assert.deepEqual(
  getAdvancedParameters(capability).map((parameter) => parameter.name),
  ['cfgScale', 'negativePrompt', 'returnLastFrame'],
  'advancedParams order should be respected and deprecated hidden by default'
);
assert.equal(getAdvancedParameters(null).length, 0, 'missing capability should return an empty list');
assert.equal(getAdvancedParameters(capability).some((parameter) => parameter.name === 'watermark'), false);
assert.equal(getAdvancedParameters(capability).some((parameter) => parameter.name === 'aspectRatio'), false);
assert.equal(getAdvancedParameters(capability).some((parameter) => parameter.name === 'generateAudio'), false);
assert.equal(getAdvancedParameters(capability).some((parameter) => parameter.name === 'seed'), false);
assert.equal(getAdvancedParameters(capability, { deprecatedParam: 'legacy' }).some((parameter) => parameter.name === 'deprecatedParam'), true);
assert.deepEqual(getBasicParameters(capability).map((parameter) => parameter.name), ['aspectRatio']);
assert.deepEqual(getParametersByGroup(capability, 'hidden').map((parameter) => parameter.name), ['watermark']);
assert.equal(isParameterHidden(capability, 'watermark'), true);
assert.equal(isParameterVisible(capability, 'negativePrompt'), true);
assert.equal(isParameterVisible(capability, 'deprecatedParam'), false);
assert.equal(isParameterVisible(capability, 'deprecatedParam', { deprecatedParam: 'legacy' }), true);
assert.equal(getParameterDefaultValue({ type: 'boolean' }), false);
assert.equal(getParameterDefaultValue({ type: 'select', options: ['a'] }), 'a');
assert.equal(coerceParameterValue({ type: 'number' }, '1.25'), 1.25);
assert.equal(coerceParameterValue({ type: 'integer' }, '3.8'), 3);
assert.equal(coerceParameterValue({ type: 'boolean' }, 'true'), true);
assert.equal(coerceParameterValue({ type: 'text' }, 42), '42');

console.log('videoParameterSchema tests passed');
