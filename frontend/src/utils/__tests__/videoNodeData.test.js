import assert from 'node:assert/strict';
import {
  buildSyncedVideoParamsPatch,
  buildVideoSchemaSnapshot,
  createDefaultVideoNodeData,
  normalizeVideoNodeData,
  sanitizeVideoNodeDataForSave,
  updateVideoNodeParam,
} from '../videoNodeData.js';
import {
  getVideoModelConfig,
  normalizeVideoGenerationSettings,
} from '../videoGenerationOptions.js';

const capability = {
  schemaVersion: 1,
  provider: 'google',
  model: 'veo-3.1-generate-001',
  displayName: 'Veo 3.1',
  family: 'veo',
  mediaType: 'video',
  taskTypes: ['text-to-video', 'image-to-video'],
  inputCapabilities: { 'text:prompt': { type: 'text', supported: true, required: true } },
  outputCapabilities: { 'video:out': { type: 'video', supported: true, required: true } },
  parameters: {
    aspectRatio: { type: 'select', group: 'basic', default: '16:9', options: ['16:9', '9:16'] },
    negativePrompt: { type: 'text', group: 'advanced', default: '' },
  },
  adapterHints: { apiKey: 'secret' },
  hiddenParams: { token: 'secret' },
  uiHints: { verbose: true },
  featured: true,
  experimental: false,
  deprecated: false,
};

const defaultData = createDefaultVideoNodeData(capability);
assert.equal(defaultData.provider, 'google');
assert.equal(defaultData.model, 'veo-3.1-generate-001');
assert.equal(defaultData.taskType, 'text-to-video');
assert.equal(typeof defaultData.params, 'object');
assert.equal(defaultData.schemaSnapshot.provider, 'google');

const updated = updateVideoNodeParam(defaultData, 'aspectRatio', '9:16');
assert.equal(updated.params.aspectRatio, '9:16');
assert.equal(updated.aspectRatio, undefined);

const googleVeoModel = getVideoModelConfig('google', 'veo-3.1-generate-001');
const staleToolbarSettings = {
  provider: 'google',
  model: 'veo-3.1-generate-001',
  videoMode: 'text-to-video',
  aspectRatio: '16:9',
  duration: '8s',
  resolution: '1080p',
  params: {
    videoMode: 'text-to-video',
    aspectRatio: '16:9',
    duration: '8s',
    resolution: '1080p',
  },
};
const staleRootOnlyChange = normalizeVideoGenerationSettings({
  ...staleToolbarSettings,
  videoMode: 'image-to-video',
  aspectRatio: '9:16',
  duration: '4s',
  resolution: '720p',
});
assert.equal(staleRootOnlyChange.videoMode, 'text-to-video');
assert.equal(staleRootOnlyChange.aspectRatio, '16:9');
assert.equal(staleRootOnlyChange.duration, '8s');
assert.equal(staleRootOnlyChange.resolution, '1080p');

const syncedToolbarPatch = buildSyncedVideoParamsPatch({
  settings: staleToolbarSettings,
  nextSettings: {
    ...staleToolbarSettings,
    videoMode: 'image-to-video',
    aspectRatio: '9:16',
    duration: '4s',
    resolution: '720p',
  },
  modelConfig: googleVeoModel,
});
assert.equal(syncedToolbarPatch.params.videoMode, 'image-to-video');
assert.equal(syncedToolbarPatch.params.aspectRatio, '9:16');
assert.equal(syncedToolbarPatch.params.duration, '4s');
assert.equal(syncedToolbarPatch.params.resolution, '720p');

const normalizedSyncedToolbarPatch = normalizeVideoGenerationSettings(syncedToolbarPatch);
assert.equal(normalizedSyncedToolbarPatch.videoMode, 'image-to-video');
assert.equal(normalizedSyncedToolbarPatch.aspectRatio, '9:16');
assert.equal(normalizedSyncedToolbarPatch.duration, '4s');
assert.equal(normalizedSyncedToolbarPatch.resolution, '720p');

const snapshot = buildVideoSchemaSnapshot(capability);
assert.equal(snapshot.provider, 'google');
assert.deepEqual(snapshot.parameterSummary.aspectRatio.options, ['16:9', '9:16']);
assert.equal(snapshot.adapterHints, undefined);
assert.equal(snapshot.hiddenParams, undefined);
assert.equal(snapshot.uiHints, undefined);
assert.equal(snapshot.parameters, undefined);

const normalizedEmpty = normalizeVideoNodeData({}, capability);
assert.equal(normalizedEmpty.provider, 'google');
assert.equal(normalizedEmpty.params.aspectRatio, '16:9');

const normalizedLegacy = normalizeVideoNodeData({
  provider: 'google',
  model: 'veo-3.1-generate-001',
  videoMode: 'image-to-video',
  aspectRatio: '9:16',
  negativePrompt: 'low quality',
  outputs: { videoUrl: '/api/generation/video.mp4' },
});
assert.equal(normalizedLegacy.taskType, 'image-to-video');
assert.equal(normalizedLegacy.params.aspectRatio, '9:16');
assert.equal(normalizedLegacy.params.negativePrompt, 'low quality');
assert.equal(normalizedLegacy.outputs.video.url, '/api/generation/video.mp4');

const sanitized = sanitizeVideoNodeDataForSave({
  provider: 'google',
  model: 'veo-3.1-generate-001',
  videoMode: 'text-to-video',
  aspectRatio: '16:9',
  rawResponse: { id: 'raw' },
  apiKey: 'secret',
  task: { status: 'running' },
  params: {
    negativePrompt: 'data:image/png;base64,aaaa',
    seed: 123,
    privateKey: 'secret',
  },
  outputs: {
    video: {
      path: 'generation/video.mp4',
      url: '/api/generation/video.mp4',
      rawProviderResponse: { ok: true },
    },
    lastFrame: {
      path: 'Z:\\tmp\\frame.png',
      url: 'blob:http://local',
    },
  },
}, capability);

assert.deepEqual(Object.keys(sanitized).sort(), ['model', 'outputs', 'params', 'provider', 'schemaSnapshot', 'taskType']);
assert.equal(sanitized.params.seed, 123);
assert.equal(sanitized.params.negativePrompt, undefined);
assert.equal(sanitized.params.privateKey, undefined);
assert.equal(sanitized.rawResponse, undefined);
assert.equal(sanitized.task, undefined);
assert.equal(sanitized.outputs.video.path, 'generation/video.mp4');
assert.equal(sanitized.outputs.video.url, '/api/generation/video.mp4');
assert.equal(sanitized.outputs.video.rawProviderResponse, undefined);
assert.equal(sanitized.outputs.lastFrame.path, undefined);
assert.equal(sanitized.outputs.lastFrame.url, undefined);

console.log('videoNodeData tests passed');
