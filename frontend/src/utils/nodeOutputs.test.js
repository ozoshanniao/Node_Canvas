import assert from 'node:assert/strict';
import { getNodeOmniParamsOutput } from './nodeOutputs.js';

const makeOmniNode = (data) => ({
  id: 'omni-1',
  type: 'omniComposerNode',
  data,
});

{
  const output = getNodeOmniParamsOutput(makeOmniNode({
    prompt: 'Use <<<element_1>>>',
    elements: ['123456'],
  }));

  assert.equal(output.isValid, true);
  assert.deepEqual(output.elements, [
    {
      alias: 'element_1',
      elementId: 123456,
    },
  ]);
}

{
  const output = getNodeOmniParamsOutput(makeOmniNode({
    prompt: 'Use <<<element_1>>>',
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

console.log('nodeOutputs tests passed');
