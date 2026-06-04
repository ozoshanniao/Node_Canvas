import assert from 'node:assert/strict';
import { buildSplitGridGenerateSets } from '../splitGridGenerateSets.js';

const { nodesToAdd } = buildSplitGridGenerateSets({
  splitGridNode: {
    id: 'split-1',
    type: 'splitGridNode',
    position: { x: 100, y: 200 },
    width: 520,
    data: {
      slices: [{ width: 1024, height: 1024 }],
    },
  },
  rows: 1,
  cols: 1,
  defaultPrompt: 'Generated prompt',
  existingNodes: [],
  projectPath: 'Z:/project',
});

const textNode = nodesToAdd.find((node) => node.type === 'textNode');

assert.ok(textNode);
assert.equal(textNode.width, 320);
assert.equal(textNode.height, 200);
assert.equal(textNode.data.text, 'Generated prompt');
assert.equal(textNode.data.projectPath, 'Z:/project');

console.log('splitGridGenerateSets tests passed');
