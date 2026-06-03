import assert from 'node:assert/strict';
import { NODE_DEFINITIONS, getNodeDefinition } from '../../nodes/nodeDefinitions.js';
import { getDockCategoryNodes, DOCK_CATEGORIES } from '../nodeCategories.js';
import { getCompatibleTargetHandle } from '../nodeCompatibility.js';

const audioDefinition = getNodeDefinition('audioInputNode');
assert.equal(audioDefinition.label, 'Audio Input');
assert.deepEqual(audioDefinition.outputs, [{ id: 'audio:out', kind: 'audio' }]);
assert.deepEqual(audioDefinition.defaultSize, { width: 280, height: 160 });

const videoInputDefinition = getNodeDefinition('videoInputNode');
assert.equal(videoInputDefinition.label, 'Video Input');
assert.deepEqual(videoInputDefinition.outputs, [{ id: 'video:out', kind: 'video' }]);
assert.deepEqual(videoInputDefinition.defaultData.aspectRatio, '16:9');
assert.deepEqual(videoInputDefinition.defaultSize, { width: 360, height: 203 });

const videoDefinition = getNodeDefinition('videoNode');
assert.equal(videoDefinition.inputs.some((input) => input.id === 'audio:references' && input.kind === 'audio'), true);
assert.equal(videoDefinition.outputs.some((output) => output.id === 'image:lastFrame' && output.kind === 'image'), true);
assert.equal(getCompatibleTargetHandle('imageInputNode', 'image:lastFrame'), 'image:in');
assert.equal(videoDefinition.inputs.some((input) => input.id === 'image:firstFrame' && input.kind === 'image'), true);
assert.equal(videoDefinition.inputs.some((input) => input.id === 'image:references' && input.kind === 'image'), true);

const videoCategory = DOCK_CATEGORIES.find((category) => category.id === 'Video');
const videoNodes = getDockCategoryNodes(videoCategory, NODE_DEFINITIONS).map((definition) => definition.type);
assert.equal(videoNodes.includes('audioInputNode'), true);
assert.equal(videoNodes.includes('videoInputNode'), true);

const easeCurveDefinition = getNodeDefinition('easeCurveNode');
assert.equal(easeCurveDefinition.label, 'Easy Curve');
assert.equal(easeCurveDefinition.inputs.some((input) => input.id === 'video:in' && input.kind === 'video'), true);
assert.equal(easeCurveDefinition.inputs.some((input) => input.id === 'easeCurve:in' && input.kind === 'easeCurve'), true);
assert.equal(easeCurveDefinition.outputs.some((output) => output.id === 'video:out' && output.kind === 'video'), true);
assert.equal(easeCurveDefinition.outputs.some((output) => output.id === 'easeCurve:out' && output.kind === 'easeCurve'), true);
assert.deepEqual(easeCurveDefinition.defaultSize, { width: 360, height: 260 });
assert.equal(getCompatibleTargetHandle('easeCurveNode', 'video:out'), 'video:in');
assert.equal(getCompatibleTargetHandle('easeCurveNode', 'easeCurve:out'), 'easeCurve:in');
assert.equal(videoNodes.includes('easeCurveNode'), true);

console.log('nodeDefinitions tests passed');
