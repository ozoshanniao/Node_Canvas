import assert from 'node:assert/strict';
import { NODE_DEFINITIONS, getNodeDefinition } from '../../nodes/nodeDefinitions.js';
import { getDockCategoryNodes, DOCK_CATEGORIES } from '../nodeCategories.js';
import { getCompatibleTargetHandle } from '../nodeCompatibility.js';

const audioDefinition = getNodeDefinition('audioInputNode');
assert.equal(audioDefinition.label, 'Audio Input');
assert.deepEqual(audioDefinition.outputs, [{ id: 'audio:out', kind: 'audio' }]);
assert.deepEqual(audioDefinition.defaultSize, { width: 280, height: 160 });

const videoDefinition = getNodeDefinition('videoNode');
assert.equal(videoDefinition.inputs.some((input) => input.id === 'audio:references' && input.kind === 'audio'), true);
assert.equal(videoDefinition.outputs.some((output) => output.id === 'image:lastFrame' && output.kind === 'image'), true);
assert.equal(getCompatibleTargetHandle('imageInputNode', 'image:lastFrame'), 'image:in');
assert.equal(videoDefinition.inputs.some((input) => input.id === 'image:firstFrame' && input.kind === 'image'), true);
assert.equal(videoDefinition.inputs.some((input) => input.id === 'image:references' && input.kind === 'image'), true);

const videoCategory = DOCK_CATEGORIES.find((category) => category.id === 'Video');
const videoNodes = getDockCategoryNodes(videoCategory, NODE_DEFINITIONS).map((definition) => definition.type);
assert.equal(videoNodes.includes('audioInputNode'), true);

console.log('nodeDefinitions tests passed');
