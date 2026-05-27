import assert from 'node:assert/strict';
import {
  VIDEO_GENERATION_REGISTRY,
  buildVideoQuickParamLabel,
  fetchVideoGenerationRegistry,
  getActiveVideoHandlesForMode,
  getVideoAdvancedParamEntries,
  getVideoModelConfig,
  isVideoTaskActive,
  normalizeVideoGenerationSettings,
  resolveKlingOmniElements,
  shouldShowVideoCustomParams,
  shouldShowVideoNegativePrompt,
} from '../videoGenerationOptions.js';

const dynamicRegistry = structuredClone(VIDEO_GENERATION_REGISTRY);
dynamicRegistry.providers[0].models[0].params.aspectRatio.options = ['1:1'];
dynamicRegistry.providers[0].models[0].params.aspectRatio.default = '1:1';

for (const status of ['submitting', 'queued', 'running', 'processing', 'pending', 'submitted']) {
  assert.equal(isVideoTaskActive(status), true, `${status} should be active`);
}
for (const status of ['idle', 'success', 'error', 'cancelled', '', undefined]) {
  assert.equal(isVideoTaskActive(status), false, `${status} should be inactive`);
}

const dynamicSettings = normalizeVideoGenerationSettings(
  { provider: 'yunwu', model: 'veo3.1', aspectRatio: '16:9' },
  dynamicRegistry
);
assert.equal(dynamicSettings.aspectRatio, '1:1', 'dynamic registry should drive normalized select options');

const fallbackSettings = normalizeVideoGenerationSettings(
  { provider: 'yunwu', model: 'veo3.1', aspectRatio: '16:9' },
  null
);
assert.equal(fallbackSettings.aspectRatio, '16:9', 'missing dynamic registry should use local fallback options');

const dynamicModel = getVideoModelConfig('yunwu', 'veo3.1', dynamicRegistry);
assert.deepEqual(dynamicModel.params.aspectRatio.options, ['1:1']);

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
  getActiveVideoHandlesForMode('multimodal-reference', seedanceModel, { provider: 'seedance_official', model: seedanceModel.id }),
  ['text:prompt', 'image:references', 'video:references', 'audio:references'],
  'Seedance multimodal handles should include media reference ports'
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
