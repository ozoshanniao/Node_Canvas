import assert from 'node:assert/strict';
import { getNodeOmniParamsOutput } from './nodeOutputs.js';

const makeOmniNode = (data) => ({
  id: 'omni-1',
  type: 'omniComposerNode',
  data,
});

const imageNode = {
  id: 'image-1',
  type: 'imageNode',
  data: {
    url: 'input/ref.png',
  },
};

const imageEdge = {
  id: 'edge-image',
  source: 'image-1',
  target: 'omni-1',
  targetHandle: 'image:references',
};

{
  const output = getNodeOmniParamsOutput(
    makeOmniNode({
      prompt: 'Use @image_1 with @element_1',
      elements: ['123456'],
    }),
    [imageEdge],
    [imageNode]
  );

  assert.equal(output.isValid, true);
  assert.equal(output.resolvedPrompt, 'Use <<<image_1>>> with <<<element_1>>>');
}

{
  const output = getNodeOmniParamsOutput(makeOmniNode({
    prompt: 'Use @element_1',
    elements: ['123456'],
  }));

  assert.equal(output.isValid, true);
  assert.equal(output.resolvedPrompt, 'Use <<<element_1>>>');
  assert.deepEqual(output.elements, [
    {
      alias: 'element_1',
      elementId: 123456,
    },
  ]);
}

{
  const output = getNodeOmniParamsOutput(makeOmniNode({
    prompt: 'Use @element_1',
    elements: ['abc'],
  }));

  assert.equal(output.isValid, false);
  assert.equal(output.errors.includes('Invalid Kling element ID.'), true);
  assert.equal(Number.isNaN(output.elements[0].elementId), true);
}

{
  const output = getNodeOmniParamsOutput(makeOmniNode({
    prompt: 'No element reference required',
    elements: ['', '789'],
  }));

  assert.equal(output.isValid, true);
  assert.deepEqual(output.elements, [
    {
      alias: 'element_1',
      elementId: 789,
    },
  ]);
}

{
  const output = getNodeOmniParamsOutput(makeOmniNode({
    prompt: 'Use <<<element_1>>>',
    elements: [''],
  }));

  assert.equal(output.isValid, false);
  assert.equal(output.errors.includes('Unknown Omni reference: <<<element_1>>>'), true);
}

{
  const output = getNodeOmniParamsOutput(makeOmniNode({
    prompt: 'Use <<<image_1>>>',
    elements: [],
  }), [imageEdge], [imageNode]);

  assert.equal(output.isValid, true);
  assert.equal(output.resolvedPrompt, 'Use <<<image_1>>>');
}

{
  const output = getNodeOmniParamsOutput(makeOmniNode({
    prompt: 'Use @element_2',
    elements: ['123456'],
  }));

  assert.equal(output.isValid, false);
  assert.equal(output.errors.includes('Unknown Omni reference: @element_2'), true);
}

console.log('nodeOutputs tests passed');
