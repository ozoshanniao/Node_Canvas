import assert from 'node:assert/strict';
import { sanitizePastedNodeData } from '../nodeClipboard.js';
import { sanitizeNodeDefaults } from '../nodeDefaults.js';
import { buildRuntimeKlingOmniReferences, sanitizePersistedKlingOmniReferences } from '../klingOmniReferences.js';

const imageSource = {
  provider: 'google-studio',
  model: 'imagen-test',
  prompt: 'A configured prompt',
  params: { aspectRatio: '16:9', resolution: '2k' },
  modelSchemaSnapshot: { version: 1 },
  url: '/api/generated/image.png',
  urls: ['/api/generated/image-1.png', '/api/generated/image-2.png'],
  selectedIndex: 1,
  currentIndex: 1,
  task: { id: 'image-task-1', status: 'running' },
  status: 'running',
  progress: 50,
  error: 'old error',
  runRequestId: 123,
};
const imageSnapshot = structuredClone(imageSource);
const sanitizedImage = sanitizePastedNodeData('imageNode', imageSource);

assert.equal(sanitizedImage.provider, imageSource.provider);
assert.equal(sanitizedImage.model, imageSource.model);
assert.equal(sanitizedImage.prompt, imageSource.prompt);
assert.deepEqual(sanitizedImage.params, imageSource.params);
assert.deepEqual(sanitizedImage.modelSchemaSnapshot, imageSource.modelSchemaSnapshot);
[
  'url', 'urls', 'selectedIndex', 'currentIndex', 'task',
  'status', 'progress', 'error', 'runRequestId',
].forEach((field) => assert.equal(field in sanitizedImage, false, `ImageNode should clear ${field}`));
assert.deepEqual(imageSource, imageSnapshot);

const videoSource = {
  provider: 'kling',
  model: 'kling-3',
  prompt: 'Configured video prompt',
  videoMode: 'image-to-video',
  duration: '10s',
  aspectRatio: '16:9',
  resolution: '1080p',
  params: { duration: '10s', aspectRatio: '16:9', resolution: '1080p' },
  schemaSnapshot: { version: 2 },
  task: {
    id: 'video-task-1',
    providerTaskId: 'provider-task-1',
    status: 'running',
    progress: 75,
    error: 'old task error',
  },
  outputs: {
    video: { url: '/api/generated/video.mp4', path: 'generation/video.mp4' },
    videoUrl: '/api/generated/video.mp4',
    outputVideoUrl: '/api/generated/output.mp4',
    outputVideoPath: 'generation/output.mp4',
    lastFrame: { url: '/api/generated/last-frame.png' },
    lastFrameUrl: '/api/generated/last-frame.png',
  },
  videoUrl: '/api/generated/legacy-video.mp4',
  outputVideoUrl: '/api/generated/legacy-output.mp4',
  outputVideoPath: 'generation/legacy-output.mp4',
  lastFrame: { url: '/api/generated/legacy-last-frame.png' },
  isPolling: true,
  pollingTaskId: 'video-task-1',
  status: 'running',
  progress: 75,
  error: 'old error',
  runRequestId: 456,
};
const videoSnapshot = structuredClone(videoSource);
const sanitizedVideo = sanitizePastedNodeData('videoNode', videoSource);

assert.equal(sanitizedVideo.provider, videoSource.provider);
assert.equal(sanitizedVideo.model, videoSource.model);
assert.equal(sanitizedVideo.prompt, undefined);
assert.equal(sanitizedVideo.videoMode, undefined);
assert.equal(sanitizedVideo.duration, undefined);
assert.equal(sanitizedVideo.aspectRatio, undefined);
assert.equal(sanitizedVideo.resolution, undefined);
assert.deepEqual(sanitizedVideo.params, {
  prompt: videoSource.prompt,
  videoMode: videoSource.videoMode,
  duration: '10s',
  aspectRatio: '16:9',
  resolution: '1080p',
});
assert.deepEqual(sanitizedVideo.schemaSnapshot, videoSource.schemaSnapshot);
[
  'task', 'outputs', 'videoUrl', 'outputVideoUrl', 'outputVideoPath',
  'lastFrame', 'isPolling', 'pollingTaskId', 'status', 'progress', 'error', 'runRequestId',
].forEach((field) => assert.equal(field in sanitizedVideo, false, `VideoNode should clear ${field}`));
assert.deepEqual(videoSource, videoSnapshot);

const imageInputSource = {
  url: '/api/input/source.png',
  filePath: 'input/source.png',
  mimeType: 'image/png',
  sourceType: 'project-file',
  naturalWidth: 1920,
  naturalHeight: 1080,
};
const sanitizedImageInput = sanitizePastedNodeData('imageInputNode', imageInputSource);
assert.deepEqual(sanitizedImageInput, imageInputSource);
assert.notEqual(sanitizedImageInput, imageInputSource);
assert.equal(sanitizedImageInput.url, imageInputSource.url);

const textSource = {
  text: 'Keep ordinary node data unchanged',
  nested: { url: 'configuration-value', task: 'ordinary-data', error: 'ordinary-data' },
};
const sanitizedText = sanitizePastedNodeData('textNode', textSource);
assert.deepEqual(sanitizedText, textSource);
assert.notEqual(sanitizedText, textSource);
assert.notEqual(sanitizedText.nested, textSource.nested);

const mixedNodes = [
  { type: 'imageNode', data: imageSource },
  { type: 'videoNode', data: videoSource },
  { type: 'imageInputNode', data: imageInputSource },
].map((node) => ({ ...node, data: sanitizePastedNodeData(node.type, node.data) }));

assert.equal('url' in mixedNodes[0].data, false);
assert.equal('task' in mixedNodes[1].data, false);
assert.equal(mixedNodes[2].data.url, imageInputSource.url);

console.log('nodeClipboard tests passed');
const legacyOmniCustomParams = {
  kling: {
    omniParams: {
      images: [
        {
          alias: 'image_1',
          role: 'reference',
          sourceNodeId: 'node-a',
          sourceHandle: 'image:out',
          url: 'https://example.test/raw.png?token=secret',
          index: 0,
        },
        { alias: 'image_2', role: 'reference', url: 'blob:http://127.0.0.1/raw' },
      ],
    },
  },
};

assert.deepEqual(
  sanitizePersistedKlingOmniReferences(legacyOmniCustomParams).kling.omniParams.images,
  [{ alias: 'image_1', role: 'reference', sourceNodeId: 'node-a', sourceHandle: 'image:out' }],
  'persisted Kling Omni references should keep only trusted descriptors'
);

const runtimeSource = {
  prompt: 'Use @image_1 and @image_2',
  resolvedPrompt: 'Use <<<image_1>>> and <<<image_2>>>',
  shotMode: 'single',
  images: [
    { alias: 'image_1', role: 'reference', url: 'https://example.test/a.png', sourceNodeId: 'a', sourceHandle: 'image:out' },
    { alias: 'image_2', role: 'end_frame', url: 'https://example.test/b.png', sourceNodeId: 'b', sourceHandle: 'image:out' },
  ],
  elements: [{ alias: 'element_1', elementId: 123 }],
};
const runtimeSourceSnapshot = structuredClone(runtimeSource);
const runtimeRefs = buildRuntimeKlingOmniReferences(runtimeSource);
assert.deepEqual(runtimeRefs.images, ['https://example.test/a.png', 'https://example.test/b.png']);
assert.deepEqual(runtimeRefs.omniParams.images, [
  { alias: 'image_1', role: 'reference', index: 0 },
  { alias: 'image_2', role: 'end_frame', index: 1 },
]);
assert.equal(JSON.stringify(runtimeRefs.omniParams).includes('https://example.test'), false);
assert.deepEqual(runtimeSource, runtimeSourceSnapshot, 'runtime helper must not mutate source output');

const videoWithLegacyOmni = {
  provider: 'kling',
  model: 'kling-v3-omni',
  params: { customParams: legacyOmniCustomParams },
  customParams: legacyOmniCustomParams,
};
const sanitizedLegacyOmni = sanitizePastedNodeData('videoNode', videoWithLegacyOmni);
assert.equal(JSON.stringify(sanitizedLegacyOmni).includes('https://example.test/raw.png'), false);
assert.equal(JSON.stringify(sanitizedLegacyOmni).includes('blob:http://127.0.0.1/raw'), false);
assert.deepEqual(sanitizedLegacyOmni.customParams.kling.omniParams.images, [
  { alias: 'image_1', role: 'reference', sourceNodeId: 'node-a', sourceHandle: 'image:out' },
]);


const videoWithLegacyStandardParams = sanitizePastedNodeData('videoNode', {
  provider: 'google',
  model: 'veo-3.1-generate-001',
  videoMode: 'image-to-video',
  aspectRatio: '9:16',
  duration: '4s',
  params: {
    videoMode: 'text-to-video',
    aspectRatio: '16:9',
    duration: '8s',
  },
});
assert.equal(videoWithLegacyStandardParams.videoMode, undefined);
assert.equal(videoWithLegacyStandardParams.aspectRatio, undefined);
assert.equal(videoWithLegacyStandardParams.duration, undefined);
assert.deepEqual(videoWithLegacyStandardParams.params, {
  videoMode: 'text-to-video',
  aspectRatio: '16:9',
  duration: '8s',
});

const videoDefaultsWithParams = sanitizeNodeDefaults('videoGeneration', {
  provider: 'google',
  model: 'veo-3.1-generate-001',
  aspectRatio: '9:16',
  duration: '4s',
  params: {
    aspectRatio: '16:9',
    duration: '8s',
  },
});
assert.equal(videoDefaultsWithParams.aspectRatio, undefined);
assert.equal(videoDefaultsWithParams.duration, undefined);
assert.deepEqual(videoDefaultsWithParams.params, { aspectRatio: '16:9', duration: '8s' });

const defaultParams = sanitizeNodeDefaults('videoGeneration', { customParams: legacyOmniCustomParams });
assert.equal(JSON.stringify(defaultParams).includes('token=secret'), false);
assert.deepEqual(defaultParams.customParams.kling.omniParams.images, [
  { alias: 'image_1', role: 'reference', sourceNodeId: 'node-a', sourceHandle: 'image:out' },
]);