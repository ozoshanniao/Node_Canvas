import assert from 'node:assert/strict';
import {
  collectTextVariablesFromInputs,
  getAllAvailableVariables,
  getConnectedTextVariables,
  getMissingVariables,
  getStaticMediaSuggestions,
  resolveTextTemplate,
} from '../textVariables.js';

const suggestionNames = (items) => items.map((item) => item.key);

assert.deepEqual(
  suggestionNames(getStaticMediaSuggestions('', '')),
  ['@image_1', '@video_1', '@audio_1']
);

assert.deepEqual(
  suggestionNames(getStaticMediaSuggestions('', 'i')),
  ['@image_1']
);

assert.deepEqual(
  suggestionNames(getStaticMediaSuggestions('Use @image_1', 'image')),
  ['@image_2']
);

assert.deepEqual(
  suggestionNames(getStaticMediaSuggestions('Use @image1', 'image')),
  ['@image_2']
);

assert.deepEqual(
  suggestionNames(getStaticMediaSuggestions('Use @image_1 and @image_3', 'image')),
  ['@image_4']
);

const nodes = [
  { id: 'text-a', type: 'textNode', data: { variableName: 'intro', text: 'Hello' } },
  { id: 'text-b', type: 'textNode', data: { variableName: 'scene', text: 'Forest' } },
  { id: 'construction', type: 'textConstruction', data: { template: '@intro @scene @missing' } },
];
const edges = [
  { id: 'edge-a', source: 'text-a', target: 'construction', targetHandle: 'text:in' },
];

assert.equal(getAllAvailableVariables(nodes).some((item) => item.key === '@intro'), true);
assert.equal(getStaticMediaSuggestions('', 'i').some((item) => item.key === '@intro'), false);

const connected = getConnectedTextVariables(nodes, edges, 'construction');
assert.deepEqual(connected.map((item) => item.key), ['@intro']);
assert.equal(connected.some((item) => item.key === '@scene'), false);
assert.equal(connected.some((item) => item.key === '@image_1'), false);

const variables = collectTextVariablesFromInputs('construction', nodes, edges);
assert.deepEqual(variables, { intro: 'Hello' });
assert.equal(resolveTextTemplate('@intro @scene', variables), 'Hello @scene');
assert.deepEqual(getMissingVariables('@intro @scene @missing', variables), ['scene', 'missing']);

console.log('textVariables tests passed');
