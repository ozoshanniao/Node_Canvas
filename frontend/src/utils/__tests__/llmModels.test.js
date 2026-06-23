import assert from 'node:assert/strict';
import {
  getActiveLLMInputHandles,
  getDefaultLLMParameters,
  getLLMModelCapabilities,
  getLLMModelLabel,
  getLLMModelsByProvider,
  fetchLLMProviders,
  getLLMProvider,
  getLLMProviderLabel,
  normalizeLLMSpecs,
} from '../llmModels.js';

const deepseekProvider = getLLMProvider('deepseek');
assert.equal(deepseekProvider.id, 'deepseek');
assert.equal(deepseekProvider.label, 'DeepSeek');

const deepseekModels = getLLMModelsByProvider('deepseek').map((model) => model.id);
assert.deepEqual(deepseekModels, ['deepseek-v4-flash', 'deepseek-v4-pro']);

for (const modelId of deepseekModels) {
  const capabilities = getLLMModelCapabilities('deepseek', modelId);
  assert.equal(capabilities.supportsImages, false);
  assert.equal(capabilities.supportsThinking, true);
  assert.equal(capabilities.supportsReasoningEffort, true);
  assert.equal(capabilities.supportsStreaming, false);
  assert.equal(capabilities.supportsTools, false);
  assert.equal(capabilities.supportsJsonMode, false);
  assert.equal(capabilities.supportsHistory, false);
  assert.equal(capabilities.supportsLocalSoftSkills, true);
}


const googleProvider = getLLMProvider('Google');
assert.equal(googleProvider.id, 'Google');
assert.equal(googleProvider.label, 'Google Cloud');
assert.equal(getLLMProviderLabel('Google'), 'Google Cloud');

assert.deepEqual(getActiveLLMInputHandles('deepseek', 'deepseek-v4-flash'), ['text:in']);
assert.deepEqual(getActiveLLMInputHandles('Google', 'gemini-3.1-flash-lite'), ['text:in', 'image:in']);
assert.equal(getLLMModelCapabilities('Google', 'gemini-3.1-flash-lite').supportsLocalSoftSkills, false);
assert.equal(getLLMModelCapabilities('Yunwu', 'gemini-3.1-flash-lite').supportsLocalSoftSkills, false);

assert.deepEqual(getDefaultLLMParameters('deepseek'), {
  thinking: 'enabled',
  reasoningEffort: 'high',
  thinkingLevel: undefined,
  temperature: 0.85,
  maxTokens: 8192,
});

console.log('llmModels tests passed');


const specsPayload = {
  schemaVersion: 1,
  providers: [
    {
      id: 'openai',
      label: 'OpenAI',
      models: [
        { id: 'gpt-5.5', label: 'GPT 5.5', enabled: true, supportsImages: true, streaming: false },
      ],
      parameters: { temperature: { enabled: true, default: 0.85 } },
    },
    {
      id: 'anthropic',
      label: 'Claude',
      models: [
        { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', enabled: true, supportsImages: true, streaming: false },
      ],
    },
  ],
};

const specsProviders = normalizeLLMSpecs(specsPayload);
assert.equal(getLLMProviderLabel('openai', specsProviders), 'OpenAI');
assert.deepEqual(getLLMModelsByProvider('openai', specsProviders).map((model) => model.id), ['gpt-5.5']);
assert.deepEqual(getLLMModelsByProvider('anthropic', specsProviders).map((model) => model.id), ['claude-sonnet-4-6']);
assert.deepEqual(getActiveLLMInputHandles('openai', 'gpt-5.5', specsProviders), ['text:in', 'image:in']);
assert.equal(getLLMModelLabel('openai', 'legacy-unknown', specsProviders), 'legacy-unknown');
assert.equal(getLLMProviderLabel('legacy-provider', specsProviders), 'legacy-provider');

const loadedProviders = await fetchLLMProviders(async () => ({
  ok: true,
  json: async () => specsPayload,
}));
assert.equal(loadedProviders[0].id, 'openai');

await assert.rejects(
  fetchLLMProviders(async () => ({ ok: false })),
  /Failed to load LLM specs/
);

assert.equal(
  getLLMModelsByProvider('deepseek').map((model) => model.id).join(','),
  'deepseek-v4-flash,deepseek-v4-pro',
  'fallback llmModels.js remains available when specs loading fails'
);
