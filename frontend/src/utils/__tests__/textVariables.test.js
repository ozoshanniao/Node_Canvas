import assert from 'node:assert/strict';
import {
  collectTextVariablesFromInputs,
  getAllAvailableVariables,
  getConnectedTextVariables,
  getMissingVariables,
  getStaticMediaSuggestions,
  parseInlineVars,
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

{
  const result = parseInlineVars('<var="shot1">\nA shot description\n</var>');
  assert.deepEqual(result.variables, { shot1: 'A shot description' });
  assert.deepEqual(result.warnings, []);
}

{
  const result = parseInlineVars('<var="shot1">One</var>\n<var="shot2">Two</var>');
  assert.deepEqual(result.variables, { shot1: 'One', shot2: 'Two' });
  assert.deepEqual(result.warnings, []);
}

{
  const result = parseInlineVars('<var="shot1">\n  Line one\nLine two\n\n</var>');
  assert.equal(result.variables.shot1, 'Line one\nLine two');
}

{
  const result = parseInlineVars('<var="1shot">Invalid</var>');
  assert.deepEqual(result.variables, {});
  assert.equal(result.warnings.some((warning) => warning.type === 'invalid_var_name' && warning.name === '1shot'), true);
}

{
  const result = parseInlineVars('<var="shot1">First</var>\n<var="shot1">Second</var>');
  assert.deepEqual(result.variables, { shot1: 'Second' });
  assert.equal(result.warnings.some((warning) => warning.type === 'duplicate_var' && warning.name === 'shot1'), true);
}

{
  const result = parseInlineVars('<var="shot1">Missing close');
  assert.deepEqual(result.variables, {});
  assert.equal(result.warnings.some((warning) => warning.type === 'unclosed_var' && warning.name === 'shot1'), true);
}

{
  const result = parseInlineVars('<var="outer">Before <var="inner">Inside</var> After</var>');
  assert.equal(result.variables.outer, 'Before <var="inner">Inside');
  assert.equal(result.warnings.some((warning) => warning.type === 'nested_var' && warning.name === 'outer'), true);
}

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

{
  const inlineNodes = [
    {
      id: 'text-a',
      type: 'textNode',
      data: {
        variableName: 'intro',
        text: 'Hello\n<var="shot1">A shot description</var>\n<var="shot2">Another shot description</var>',
      },
    },
    { id: 'construction', type: 'textConstruction', data: { template: 'Use @shot1 then @shot2' } },
  ];
  const inlineEdges = [
    { id: 'edge-a', source: 'text-a', target: 'construction', targetHandle: 'text:in' },
  ];
  const inlineVariables = collectTextVariablesFromInputs('construction', inlineNodes, inlineEdges);
  assert.deepEqual(inlineVariables, {
    shot1: 'A shot description',
    shot2: 'Another shot description',
    intro: 'Hello\n<var="shot1">A shot description</var>\n<var="shot2">Another shot description</var>',
  });
  assert.deepEqual(
    getConnectedTextVariables(inlineNodes, inlineEdges, 'construction').map((item) => item.key),
    ['@shot1', '@shot2', '@intro']
  );
  assert.equal(resolveTextTemplate('Use @shot1 then @shot2', inlineVariables), 'Use A shot description then Another shot description');
}

{
  const priorityNodes = [
    {
      id: 'text-a',
      type: 'textNode',
      data: {
        variableName: 'shot1',
        text: '<var="shot1">Inline value</var>',
      },
    },
    { id: 'construction', type: 'textConstruction', data: { template: '@shot1' } },
  ];
  const priorityEdges = [
    { id: 'edge-a', source: 'text-a', target: 'construction', targetHandle: 'text:in' },
  ];
  assert.deepEqual(collectTextVariablesFromInputs('construction', priorityNodes, priorityEdges), {
    shot1: '<var="shot1">Inline value</var>',
  });
}

console.log('textVariables tests passed');
