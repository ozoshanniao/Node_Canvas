import assert from 'node:assert/strict';
import {
  VIDEO_GENERATION_REGISTRY,
  fetchVideoGenerationRegistry,
  getVideoModelConfig,
  isVideoTaskActive,
  normalizeVideoGenerationSettings,
  resolveKlingOmniElements,
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
