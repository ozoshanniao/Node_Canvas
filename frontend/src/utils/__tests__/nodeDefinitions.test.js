import assert from 'node:assert/strict';
import { NODE_DEFINITIONS, getNodeDefinition, getNodeDefinitionText } from '../../nodes/nodeDefinitions.js';
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
assert.equal(getCompatibleTargetHandle('videoNode', 'image:out'), 'image:firstFrame');

const videoCategory = DOCK_CATEGORIES.find((category) => category.id === 'Video');
const videoNodes = getDockCategoryNodes(videoCategory, NODE_DEFINITIONS).map((definition) => definition.type);
assert.equal(videoNodes.includes('audioInputNode'), false);
assert.equal(videoNodes.includes('videoInputNode'), true);

const audioCategory = DOCK_CATEGORIES.find((category) => category.id === 'Audio');
const audioNodes = getDockCategoryNodes(audioCategory, NODE_DEFINITIONS).map((definition) => definition.type);
assert.equal(audioNodes.includes('audioInputNode'), true);

const easeCurveDefinition = getNodeDefinition('easeCurveNode');
assert.equal(easeCurveDefinition.label, 'Easy Curve');
assert.equal(easeCurveDefinition.inputs.some((input) => input.id === 'video:in' && input.kind === 'video'), true);
assert.equal(easeCurveDefinition.inputs.some((input) => input.id === 'easeCurve:in' && input.kind === 'easeCurve'), true);
assert.equal(easeCurveDefinition.outputs.some((output) => output.id === 'video:out' && output.kind === 'video'), true);
assert.equal(easeCurveDefinition.outputs.some((output) => output.id === 'easeCurve:out' && output.kind === 'easeCurve'), true);
assert.deepEqual(easeCurveDefinition.defaultSize, { width: 360, height: 260 });
assert.equal(getCompatibleTargetHandle('easeCurveNode', 'video:out'), 'video:in');
assert.equal(getCompatibleTargetHandle('easeCurveNode', 'easeCurve:out'), 'easeCurve:in');
assert.equal(videoNodes.includes('easeCurveNode'), false);

const toolsCategory = DOCK_CATEGORIES.find((category) => category.id === 'Tools');
const toolsNodes = getDockCategoryNodes(toolsCategory, NODE_DEFINITIONS).map((definition) => definition.type);
assert.equal(toolsNodes.includes('easeCurveNode'), true);

const annotateDefinition = getNodeDefinition('annotateNode');
assert.equal(annotateDefinition.label, 'Image Annotate');
assert.deepEqual(annotateDefinition.inputs, [{ id: 'image:in', kind: 'image' }]);
assert.deepEqual(annotateDefinition.outputs, [{ id: 'image:out', kind: 'image' }]);
assert.equal(annotateDefinition.defaultData.brushSize, 12);
assert.equal(annotateDefinition.defaultData.eraserMode, 'local');
assert.equal(annotateDefinition.defaultData.eraserSize, 24);
assert.equal(getCompatibleTargetHandle('annotateNode', 'image:out'), 'image:in');
const imageCategory = DOCK_CATEGORIES.find((category) => category.id === 'Image');
const imageNodes = getDockCategoryNodes(imageCategory, NODE_DEFINITIONS).map((definition) => definition.type);
assert.equal(imageNodes.includes('annotateNode'), true);
assert.equal(imageNodes.includes('splitGridNode'), true);
assert.equal(getNodeDefinitionText((key) => key, annotateDefinition), 'Image Annotate');

console.log('nodeDefinitions tests passed');
