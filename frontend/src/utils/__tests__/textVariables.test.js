import assert from 'node:assert/strict';
import {
  collectTextVariablesFromInputs,
  getAllAvailableVariables,
  getConnectedTextVariables,
  getMissingVariables,
  getStaticMediaSuggestions,
  getTextConstructionOutput,
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

assert.equal(resolveTextTemplate('@look-1', { 'look-1': 'Closeup' }), 'Closeup');
assert.deepEqual(getMissingVariables('@look-1 @missing-var', { 'look-1': 'Closeup' }), ['missing-var']);

assert.deepEqual(getMissingVariables('Use @character @sence @bag', {
  character: 'Hero',
  sence: 'Street',
  bag: 'Leather bag',
}), []);

assert.equal(
  resolveTextTemplate('请为模特@character的姿势', { character: '年轻女性' }),
  '请为模特年轻女性的姿势'
);
assert.deepEqual(
  getMissingVariables('请为模特@character的姿势', { character: '年轻女性' }),
  []
);

assert.equal(
  resolveTextTemplate('拍摄地点：@sence\n模特饰品：@bag\n请为模特@character的姿势', {
    character: '年轻女性',
    sence: '摄影棚',
    bag: '手提包',
  }),
  '拍摄地点：摄影棚\n模特饰品：手提包\n请为模特年轻女性的姿势'
);

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
  const constructionNodes = [
    {
      id: 'text-a',
      type: 'textNode',
      data: {
        text: '<var="character">Hero</var>\n<var="sence">Street</var>\n<var="bag">Leather bag</var>',
      },
    },
    {
      id: 'construction',
      type: 'textConstruction',
      data: {
        template: 'Use @character in @sence with @bag',
        templateTokens: [
          { id: 't1', type: 'text-var', value: 'character', start: 4, end: 14 },
          { id: 't2', type: 'text-var', value: 'sence', start: 18, end: 24 },
          { id: 't3', type: 'text-var', value: 'bag', start: 30, end: 34 },
        ],
      },
    },
  ];
  const constructionEdges = [
    { id: 'edge-a', source: 'text-a', target: 'construction', targetHandle: 'text:in' },
  ];
  const output = getTextConstructionOutput(constructionNodes[1], constructionNodes, constructionEdges);
  assert.equal(output.template, 'Use @character in @sence with @bag');
  assert.equal(output.resolvedText, 'Use Hero in Street with Leather bag');
  assert.deepEqual(getMissingVariables(output.template, output.variables), []);
}

{
  const constructionNodes = [
    {
      id: 'text-a',
      type: 'textNode',
      data: {
        text: '<var="character">年轻女性</var>\n<var="sence">摄影棚</var>\n<var="bag">手提包</var>',
      },
    },
    {
      id: 'construction',
      type: 'textConstruction',
      data: {
        template: '拍摄地点：@sence\n模特饰品：@bag\n请为模特@character的高级时装摄影',
        templateTokens: [
          { id: 't1', type: 'text-var', value: 'sence', start: 5, end: 11 },
          { id: 't2', type: 'text-var', value: 'bag', start: 17, end: 21 },
          { id: 't3', type: 'text-var', value: 'character', start: 26, end: 36 },
        ],
      },
    },
  ];
  const constructionEdges = [
    { id: 'edge-a', source: 'text-a', target: 'construction', targetHandle: 'text:in' },
  ];
  const output = getTextConstructionOutput(constructionNodes[1], constructionNodes, constructionEdges);
  assert.equal(output.resolvedText, '拍摄地点：摄影棚\n模特饰品：手提包\n请为模特年轻女性的高级时装摄影');
  assert.deepEqual(getMissingVariables(output.template, output.variables), []);
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
