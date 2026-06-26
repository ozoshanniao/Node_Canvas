import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  VIDEO_GENERATION_REGISTRY,
  buildVideoTaskQueryInterruptedPatch,
  buildVideoTaskResumePatch,
  buildVideoQuickParamLabel,
  fetchVideoGenerationRegistry,
  getActiveVideoHandlesForMode,
  getEffectiveVideoMode,
  getVideoAdvancedParamEntries,
  getVideoModelConfig,
  isVideoTaskActive,
  isVideoTaskRecoverable,
  normalizeVideoGenerationSettings,
  resolveKlingOmniElements,
  shouldRenderVideoToolbarParam,
  shouldShowVideoCustomParams,
  shouldShowVideoNegativePrompt,
} from '../videoGenerationOptions.js';
import {
  getHandleState,
  getStableVideoHandles,
} from '../videoCapabilities.js';

const dynamicRegistry = structuredClone(VIDEO_GENERATION_REGISTRY);
dynamicRegistry.providers[0].models[0].params.aspectRatio.options = ['1:1'];
dynamicRegistry.providers[0].models[0].params.aspectRatio.default = '1:1';

for (const status of ['submitting', 'queued', 'running', 'processing', 'pending', 'submitted']) {
  assert.equal(isVideoTaskActive(status), true, `${status} should be active`);
}
for (const status of ['idle', 'success', 'error', 'cancelled', '', undefined]) {
  assert.equal(isVideoTaskActive(status), false, `${status} should be inactive`);
}
assert.equal(isVideoTaskActive('interrupted'), false, 'interrupted should not auto-poll forever');

const recoverableTask = {
  id: 'video_local_task',
  status: 'interrupted',
  providerTaskId: 'provider-task',
  rawCreateResponse: { id: 'provider-task' },
};
assert.equal(isVideoTaskRecoverable(recoverableTask), true, 'interrupted task with provider id should be recoverable');
assert.equal(
  isVideoTaskRecoverable({ ...recoverableTask, status: 'error' }),
  true,
  'legacy query error task with provider id should be recoverable'
);
assert.equal(
  isVideoTaskRecoverable({ ...recoverableTask, outputs: { videoUrl: '/api/video/result.mp4' } }),
  false,
  'task with a video output should not show resume query'
);
assert.equal(
  isVideoTaskRecoverable({ ...recoverableTask, providerTaskId: '' }),
  false,
  'task without provider task id cannot be resumed'
);

const interruptedPatch = buildVideoTaskQueryInterruptedPatch(recoverableTask, new Error('fetch failed'));
assert.equal(interruptedPatch.status, 'interrupted');
assert.equal(interruptedPatch.providerTaskId, 'provider-task');
assert.deepEqual(interruptedPatch.rawCreateResponse, { id: 'provider-task' });
assert.equal(interruptedPatch.error, 'fetch failed');

const resumePatch = buildVideoTaskResumePatch(interruptedPatch);
assert.equal(resumePatch.status, 'running');
assert.equal(resumePatch.providerTaskId, 'provider-task');
assert.deepEqual(resumePatch.rawCreateResponse, { id: 'provider-task' });
assert.equal(resumePatch.error, '');

const testDir = path.dirname(fileURLToPath(import.meta.url));
const useVideoTaskSource = fs.readFileSync(path.join(testDir, '../../hooks/useVideoTask.js'), 'utf8');
const videoNodeSource = fs.readFileSync(path.join(testDir, '../../nodes/VideoNode.jsx'), 'utf8');
const resumeTaskSource = useVideoTaskSource.match(/const resumeTask = useCallback\([\s\S]*?\n {2}\}, \[setTask, startPolling\]\);/)?.[0] || '';
assert.ok(resumeTaskSource, 'useVideoTask should expose a resumeTask callback');
assert.equal(resumeTaskSource.includes('/api/video/generate'), false, 'resumeTask must not call generate endpoint');
assert.equal(resumeTaskSource.includes('startTask('), false, 'resumeTask must not call startTask');
assert.equal(resumeTaskSource.includes('startPolling(nextTaskId)'), true, 'resumeTask should resume polling the existing task');

const handleClassesSource = videoNodeSource.match(/const getHandleClasses = \([\s\S]*?\n {2}\};/)?.[0] || '';
assert.ok(handleClassesSource, 'VideoNode should keep handle classes in a local helper');
assert.equal(handleClassesSource.includes('!bg-white'), false, 'VideoNode handle classes should not use white fills');
assert.equal(handleClassesSource.includes('shadow-['), false, 'VideoNode handle classes should not use glow shadows');
assert.equal(handleClassesSource.includes('ring'), false, 'VideoNode handle classes should not use ring highlights');
assert.equal(videoNodeSource.includes("{handleState.required ? ' *' : ''}"), false, 'VideoNode handle labels should not append required asterisks');
assert.equal(videoNodeSource.includes("variant={key === 'qualityMode'"), false, 'qualityMode should not use a special blue capsule variant');
assert.equal(videoNodeSource.includes('sky-'), false, 'VideoNode qualityMode capsule should not use sky-blue styling');

const dynamicSettings = normalizeVideoGenerationSettings(
  { provider: 'yunwu', model: 'veo3.1', aspectRatio: '16:9' },
  dynamicRegistry
);
assert.equal(dynamicSettings.aspectRatio, '1:1', 'dynamic registry should drive normalized select options');
assert.equal(dynamicSettings.params.aspectRatio, '1:1', 'normalized params should mirror capability-constrained standard values');

const fallbackSettings = normalizeVideoGenerationSettings(
  { provider: 'yunwu', model: 'veo3.1', aspectRatio: '16:9' },
  null
);
assert.equal(fallbackSettings.aspectRatio, '16:9', 'missing dynamic registry should use local fallback options');
assert.equal(fallbackSettings.params.aspectRatio, '16:9', 'fallback normalized params should keep the selected standard value');

const dynamicModel = getVideoModelConfig('yunwu', 'veo3.1', dynamicRegistry);
assert.deepEqual(dynamicModel.params.aspectRatio.options, ['1:1']);

const kieAggregatedRegistry = structuredClone(VIDEO_GENERATION_REGISTRY);
kieAggregatedRegistry.providers.push({
  id: 'kie',
  label: 'KIE',
  models: [
    {
      id: 'wan/2-7',
      label: 'Wan 2.7 (KIE)',
      family: 'wan',
      supportedModes: ['text-to-video', 'image-to-video'],
      inputCapabilities: { endFrame: true },
      quickParams: ['videoMode', 'aspectRatio', 'duration', 'resolution'],
      params: {
        videoMode: { type: 'select', options: ['text-to-video', 'image-to-video'], default: 'text-to-video' },
        aspectRatio: { type: 'select', options: ['16:9', '9:16', '1:1'], default: '16:9' },
        duration: { type: 'select', options: ['2s', '3s', '4s', '5s'], default: '5s' },
        resolution: { type: 'select', options: ['720p', '1080p'], default: '720p' },
      },
      customParams: {},
    },
    {
      id: 'kling-3.0/video',
      label: 'Kling 3.0 (KIE)',
      family: 'kling',
      supportedModes: ['text-to-video', 'image-to-video'],
      quickParams: ['videoMode', 'aspectRatio', 'duration', 'qualityMode'],
      params: {
        videoMode: { type: 'select', options: ['text-to-video', 'image-to-video'], default: 'text-to-video' },
        aspectRatio: { type: 'select', options: ['16:9', '9:16', '1:1'], default: '16:9' },
        duration: { type: 'select', options: ['3s', '4s', '5s'], default: '5s' },
        qualityMode: { type: 'select', options: ['std', 'pro', '4K'], default: 'pro' },
      },
      customParams: {},
    },
    {
      id: 'kling-2.6',
      label: 'Kling 2.6 (KIE)',
      family: 'kling',
      supportedModes: ['text-to-video', 'image-to-video'],
      inputCapabilities: { endFrame: false },
      quickParams: ['videoMode', 'aspectRatio', 'duration'],
      params: {
        videoMode: { type: 'select', options: ['text-to-video', 'image-to-video'], default: 'text-to-video' },
        aspectRatio: { type: 'select', options: ['1:1', '16:9', '9:16'], default: '16:9' },
        duration: { type: 'select', options: ['5s', '10s'], default: '5s' },
      },
      customParams: {},
    },
    {
      id: 'bytedance/seedance-2',
      label: 'Seedance 2.0 (KIE)',
      family: 'seedance',
      supportedModes: ['text-to-video', 'frame', 'multimodal-reference'],
      quickParams: ['videoMode', 'aspectRatio', 'duration', 'resolution'],
      params: {
        videoMode: { type: 'select', options: ['text-to-video', 'frame', 'multimodal-reference'], default: 'text-to-video' },
        aspectRatio: { type: 'select', options: ['adaptive', '16:9', '9:16'], default: 'adaptive' },
        duration: { type: 'select', options: ['4s', '5s'], default: '5s' },
        resolution: { type: 'select', options: ['480p', '720p', '1080p'], default: '720p' },
      },
      customParams: {},
    },
    {
      id: 'bytedance/seedance-2-fast',
      label: 'Seedance 2.0 Fast (KIE)',
      family: 'seedance',
      supportedModes: ['text-to-video', 'frame', 'multimodal-reference'],
      quickParams: ['videoMode', 'aspectRatio', 'duration', 'resolution'],
      params: {
        videoMode: { type: 'select', options: ['text-to-video', 'frame', 'multimodal-reference'], default: 'text-to-video' },
        aspectRatio: { type: 'select', options: ['adaptive', '16:9', '9:16'], default: 'adaptive' },
        duration: { type: 'select', options: ['4s', '5s'], default: '5s' },
        resolution: { type: 'select', options: ['480p', '720p'], default: '720p' },
      },
      customParams: {},
    },
  ],
});
assert.deepEqual(
  kieAggregatedRegistry.providers.find((provider) => provider.id === 'kie').models.map((model) => model.label),
  ['Wan 2.7 (KIE)', 'Kling 3.0 (KIE)', 'Kling 2.6 (KIE)', 'Seedance 2.0 (KIE)', 'Seedance 2.0 Fast (KIE)'],
  'KIE aggregated model dropdown should not expose legacy I2V labels'
);
const migratedWan = normalizeVideoGenerationSettings(
  { provider: 'kie', model: 'wan/2-7-image-to-video', videoMode: 'text-to-video' },
  kieAggregatedRegistry
);
assert.equal(migratedWan.model, 'wan/2-7');
assert.equal(migratedWan.videoMode, 'image-to-video');
assert.equal(migratedWan.params?.videoMode, 'image-to-video');
const migratedKling26 = normalizeVideoGenerationSettings(
  { provider: 'kie', model: 'kling-2.6/image-to-video', videoMode: 'text-to-video' },
  kieAggregatedRegistry
);
assert.equal(migratedKling26.model, 'kling-2.6');
assert.equal(migratedKling26.videoMode, 'image-to-video');
assert.equal(migratedKling26.params?.videoMode, 'image-to-video');
const migratedKling = normalizeVideoGenerationSettings(
  { provider: 'kie', model: 'kling-3.0/video/image-to-video', videoMode: 'text-to-video' },
  kieAggregatedRegistry
);
assert.equal(migratedKling.model, 'kling-3.0/video');
assert.equal(migratedKling.videoMode, 'image-to-video');
assert.equal(migratedKling.params?.videoMode, 'image-to-video');
const migratedSeedance = normalizeVideoGenerationSettings(
  { provider: 'kie', model: 'bytedance/seedance-2/image-to-video', videoMode: 'text-to-video' },
  kieAggregatedRegistry
);
assert.equal(migratedSeedance.model, 'bytedance/seedance-2');
assert.equal(migratedSeedance.videoMode, 'frame');
assert.equal(migratedSeedance.params?.videoMode, 'frame');
const migratedSeedanceFast = normalizeVideoGenerationSettings(
  { provider: 'kie', model: 'bytedance/seedance-2-fast/image-to-video', videoMode: 'text-to-video' },
  kieAggregatedRegistry
);
assert.equal(migratedSeedanceFast.model, 'bytedance/seedance-2-fast');
assert.equal(migratedSeedanceFast.videoMode, 'frame');
assert.equal(migratedSeedanceFast.params?.videoMode, 'frame');

const kieWanModel = kieAggregatedRegistry.providers.find((provider) => provider.id === 'kie').models.find((model) => model.id === 'wan/2-7');
assert.deepEqual(
  getActiveVideoHandlesForMode('text-to-video', kieWanModel, { provider: 'kie', model: 'wan/2-7', videoMode: 'text-to-video' }),
  ['text:prompt'],
  'Aggregated KIE Wan T2V handles should only include prompt'
);
assert.deepEqual(
  getActiveVideoHandlesForMode('image-to-video', kieWanModel, { provider: 'kie', model: 'wan/2-7', videoMode: 'image-to-video' }),
  ['text:prompt', 'image:firstFrame', 'image:lastFrame'],
  'Aggregated KIE Wan I2V handles should include prompt plus first/last frame'
);
assert.equal(
  shouldRenderVideoToolbarParam('aspectRatio', kieWanModel, { videoMode: 'image-to-video' }),
  false,
  'Aggregated KIE Wan I2V should hide aspectRatio toolbar param'
);
const kieKling26Model = kieAggregatedRegistry.providers.find((provider) => provider.id === 'kie').models.find((model) => model.id === 'kling-2.6');
assert.deepEqual(
  getActiveVideoHandlesForMode('text-to-video', kieKling26Model, { provider: 'kie', model: 'kling-2.6', videoMode: 'text-to-video' }),
  ['text:prompt'],
  'Aggregated KIE Kling 2.6 T2V handles should only include prompt'
);
assert.deepEqual(
  getActiveVideoHandlesForMode('image-to-video', kieKling26Model, { provider: 'kie', model: 'kling-2.6', videoMode: 'image-to-video' }),
  ['text:prompt', 'image:firstFrame'],
  'Aggregated KIE Kling 2.6 I2V handles should include prompt plus first frame'
);
for (const providerId of ['kling', 'yunwu-kling']) {
  for (const modelId of ['kling-v2-6', 'kling-v3', 'kling-v3-omni']) {
    const model = getVideoModelConfig(providerId, modelId);
    assert.equal(model.params.seed, undefined, `${providerId}/${modelId} should not expose seed`);
    assert.ok(model.params.generateAudio, `${providerId}/${modelId} should keep generateAudio`);
  }
}

assert.ok(getVideoModelConfig('yunwu', 'veo3.1').params.seed, 'Yunwu Veo seed should remain available');
assert.ok(getVideoModelConfig('google', 'veo-3.1-generate-001').params.seed, 'Google Veo seed should remain available');

const seedanceProvider = VIDEO_GENERATION_REGISTRY.providers.find((provider) => provider.id === 'seedance_official');
assert.ok(seedanceProvider, 'Seedance Official provider should be present');
assert.equal(seedanceProvider.label, 'Seedance', 'Seedance provider label should be concise');
assert.deepEqual(
  seedanceProvider.models.map((model) => model.id),
  ['doubao-seedance-2-0-260128', 'doubao-seedance-2-0-fast-260128'],
  'Seedance Official models should be present'
);
const seedanceModel = getVideoModelConfig('seedance_official', 'doubao-seedance-2-0-260128');
assert.equal(
  buildVideoQuickParamLabel({ videoMode: 'frame', aspectRatio: 'adaptive', duration: '5s', resolution: '720p' }, seedanceModel),
  'I2V · adaptive · 5s · 720p',
  'Seedance frame mode should display as I2V'
);
assert.equal(
  buildVideoQuickParamLabel({ videoMode: 'multimodal-reference', aspectRatio: 'adaptive', duration: '5s', resolution: '720p' }, seedanceModel),
  'Reference · adaptive · 5s · 720p',
  'Seedance multimodal-reference mode should display as Reference'
);
assert.deepEqual(
  getActiveVideoHandlesForMode('frame', seedanceModel, { provider: 'seedance_official', model: seedanceModel.id }),
  ['text:prompt', 'image:firstFrame', 'image:lastFrame'],
  'Seedance frame handles should include prompt and first/last frame only'
);
assert.deepEqual(
  getActiveVideoHandlesForMode('image-to-video', seedanceModel, { provider: 'seedance_official', model: seedanceModel.id }),
  ['text:prompt', 'image:firstFrame', 'image:lastFrame'],
  'Seedance image-to-video alias should include prompt and first/last frame candidates'
);
assert.deepEqual(
  getActiveVideoHandlesForMode('multimodal-reference', seedanceModel, { provider: 'seedance_official', model: seedanceModel.id }),
  ['text:prompt', 'image:references', 'video:references', 'audio:references'],
  'Seedance multimodal handles should include media reference ports'
);
assert.deepEqual(
  getActiveVideoHandlesForMode('reference-video', seedanceModel, { provider: 'seedance_official', model: seedanceModel.id }),
  ['text:prompt', 'image:references', 'video:references', 'audio:references'],
  'Seedance reference-video alias should include media reference ports'
);
assert.equal(
  getEffectiveVideoMode({ videoMode: 'image-to-video' }, seedanceModel),
  'frame',
  'Seedance official image-to-video alias should resolve to frame mode'
);
assert.equal(
  getEffectiveVideoMode({ videoMode: 'frame' }, { supportedModes: ['image-to-video'] }),
  'image-to-video',
  'Single-mode image-to-video models should keep their only supported mode'
);
const kieSeedanceI2vModel = {
  id: 'bytedance/seedance-2/image-to-video',
  family: 'seedance',
  provider: 'kie',
  supportedModes: ['image-to-video'],
};
const kieSeedanceI2vCapability = {
  inputCapabilities: {
    'text:prompt': { supported: true, required: false },
    'image:firstFrame': { supported: true, required: true },
    'image:lastFrame': { supported: true, required: false },
    'image:references': { supported: false, required: false },
    'video:references': { supported: false, required: false },
    'audio:references': { supported: false, required: false },
    'omniParams:in': { supported: false, required: false },
  },
};
const kieSeedanceI2vActiveHandles = getActiveVideoHandlesForMode('image-to-video', kieSeedanceI2vModel, {
  provider: 'kie',
  model: kieSeedanceI2vModel.id,
});
const kieSeedanceI2vVisibleHandles = getStableVideoHandles().inputs
  .map((handleId) => getHandleState(kieSeedanceI2vCapability, handleId))
  .filter((state) => state.supported && kieSeedanceI2vActiveHandles.includes(state.handleId))
  .map((state) => state.handleId);
assert.ok(kieSeedanceI2vVisibleHandles.includes('text:prompt'), 'KIE Seedance I2V visible handles should include prompt');
assert.ok(kieSeedanceI2vVisibleHandles.includes('image:firstFrame'), 'KIE Seedance I2V visible handles should include first frame');
assert.ok(kieSeedanceI2vVisibleHandles.includes('image:lastFrame'), 'KIE Seedance I2V visible handles should include last frame');
const kieKling30I2vModel = {
  id: 'kling-3.0/video/image-to-video',
  family: 'kling',
  provider: 'kie',
  supportedModes: ['image-to-video'],
  inputCapabilities: { endFrame: true },
};
const kieKling30I2vCapability = {
  inputCapabilities: {
    'text:prompt': { supported: true, required: false },
    'image:firstFrame': { supported: true, required: true },
    'image:lastFrame': { supported: true, required: false },
  },
};
const kieKling30I2vActiveHandles = getActiveVideoHandlesForMode(
  getEffectiveVideoMode({ videoMode: 'text-to-video' }, kieKling30I2vModel),
  kieKling30I2vModel,
  { provider: 'kie', model: kieKling30I2vModel.id, qualityMode: 'pro' }
);
const kieKling30I2vVisibleHandles = getStableVideoHandles().inputs
  .map((handleId) => getHandleState(kieKling30I2vCapability, handleId))
  .filter((state) => state.supported && kieKling30I2vActiveHandles.includes(state.handleId))
  .map((state) => state.handleId);
assert.deepEqual(
  kieKling30I2vVisibleHandles,
  ['text:prompt', 'image:firstFrame', 'image:lastFrame'],
  'KIE Kling 3.0 I2V visible handles should match official first/last-frame UI'
);
const google1080pSettings = normalizeVideoGenerationSettings({
  provider: 'google',
  model: 'veo-3.1-generate-001',
  params: {
    videoMode: 'text-to-video',
    resolution: '1080p',
    duration: '4s',
  },
});
assert.equal(google1080pSettings.duration, '8s', '1080p should force 8s duration');
assert.equal(google1080pSettings.params.duration, '8s', 'forced duration should be reflected in canonical params');
assert.equal(google1080pSettings.params.resolution, '1080p');

const googleVeo31 = getVideoModelConfig('google', 'veo-3.1-generate-001');
const googleI2vHandles = getActiveVideoHandlesForMode('image-to-video', googleVeo31, {
  provider: 'google',
  model: googleVeo31.id,
  videoMode: 'image-to-video',
});
assert.ok(googleI2vHandles.includes('image:firstFrame'), 'I2V handles should include current first frame handle');
assert.equal(googleI2vHandles.includes('image:images'), false, 'I2V handles should not include legacy images handle');
assert.equal(googleI2vHandles.includes('image:end'), false, 'I2V handles should not include legacy end frame handle');
assert.deepEqual(
  getActiveVideoHandlesForMode('text-to-video', googleVeo31, { provider: 'google', model: googleVeo31.id }),
  ['text:prompt'],
  'T2V handles should only include prompt'
);
assert.deepEqual(
  getActiveVideoHandlesForMode('reference-video', googleVeo31, { provider: 'google', model: googleVeo31.id }),
  ['text:prompt', 'image:references', 'video:references', 'audio:references'],
  'Reference handles should include stable reference media ports'
);
assert.deepEqual(
  getActiveVideoHandlesForMode('omni-video', getVideoModelConfig('kling', 'kling-v3-omni'), {
    provider: 'kling',
    model: 'kling-v3-omni',
  }),
  ['omniParams:in'],
  'Omni handles should only include omni params'
);
assert.equal(
  shouldRenderVideoToolbarParam('videoMode', { supportedModes: ['image-to-video'] }, { videoMode: 'image-to-video' }),
  false,
  'Single-mode models should hide the videoMode toolbar param'
);
assert.equal(
  shouldRenderVideoToolbarParam('videoMode', googleVeo31, { videoMode: 'text-to-video' }),
  true,
  'Multi-mode models should show the videoMode toolbar param'
);
assert.deepEqual(
  getVideoAdvancedParamEntries(seedanceModel).map(([key]) => key),
  ['generateAudio', 'returnLastFrame', 'seed'],
  'Seedance advanced panel should expose only Generate Audio, Return Last Frame, and Seed'
);
assert.equal(seedanceModel.params.watermark, undefined, 'Seedance should not expose Watermark in UI params');
assert.equal(
  shouldShowVideoNegativePrompt(seedanceModel, { provider: 'seedance_official', model: seedanceModel.id }),
  false,
  'Seedance advanced panel should hide Negative Prompt'
);
assert.equal(
  shouldShowVideoCustomParams(
    seedanceModel,
    { provider: 'seedance_official', model: seedanceModel.id },
    { showRawCustomParams: false }
  ),
  false,
  'Seedance advanced panel should hide Custom Params when raw params are disabled'
);
assert.equal(
  shouldShowVideoCustomParams(
    seedanceModel,
    { provider: 'seedance_official', model: seedanceModel.id },
    { showRawCustomParams: true }
  ),
  true,
  'Seedance advanced panel should show Custom Params when raw params are enabled'
);

const klingV3Model = getVideoModelConfig('kling', 'kling-v3');
assert.deepEqual(
  getVideoAdvancedParamEntries(klingV3Model).map(([key]) => key),
  ['generateAudio', 'shotMode', 'cfgScale'],
  'Kling V3 advanced params should remain unchanged'
);
assert.equal(shouldShowVideoNegativePrompt(klingV3Model, { provider: 'kling', model: 'kling-v3' }), true);
assert.equal(
  shouldShowVideoCustomParams(klingV3Model, { provider: 'kling', model: 'kling-v3' }, { showRawCustomParams: true }),
  true
);

const googleVeoModel = getVideoModelConfig('google', 'veo-3.1-generate-001');
assert.deepEqual(
  getVideoAdvancedParamEntries(googleVeoModel).map(([key]) => key),
  ['generateAudio', 'seed'],
  'Veo advanced params should remain unchanged'
);
assert.equal(shouldShowVideoNegativePrompt(googleVeoModel, { provider: 'google', model: 'veo-3.1-generate-001' }), true);
assert.equal(
  shouldShowVideoCustomParams(
    googleVeoModel,
    { provider: 'google', model: 'veo-3.1-generate-001' },
    { showRawCustomParams: true }
  ),
  true
);

const originalFetch = globalThis.fetch;
globalThis.fetch = async () => ({
  ok: true,
  json: async () => dynamicRegistry,
});
assert.equal(await fetchVideoGenerationRegistry(), dynamicRegistry, 'successful specs response should be returned');

globalThis.fetch = async () => ({
  ok: false,
  status: 503,
  json: async () => ({ detail: 'offline' }),
});
await assert.rejects(fetchVideoGenerationRegistry, /offline/, 'failed specs response should reject for fallback handling');
globalThis.fetch = originalFetch;

const omniElements = [
  {
    alias: 'element_1',
    elementId: 123456,
  },
];
assert.deepEqual(
  resolveKlingOmniElements({ elements: omniElements }),
  omniElements,
  'Omni elements should be returned from omniParamsOutput'
);

assert.deepEqual(
  resolveKlingOmniElements({ elements: [] }),
  [],
  'Empty Omni elements should return an empty array'
);

assert.deepEqual(
  resolveKlingOmniElements(undefined, { customParams: { kling: { elementIds: ['999999'] } } }),
  [],
  'Legacy VideoNode elementIds should not be read'
);

console.log('videoGenerationOptions tests passed');
