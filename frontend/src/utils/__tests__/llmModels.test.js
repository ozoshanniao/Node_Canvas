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

const googleStudioProvider = getLLMProvider('google_studio');
assert.equal(googleStudioProvider.id, 'google_studio');
assert.equal(googleStudioProvider.label, 'Google Studio');
assert.deepEqual(getLLMModelsByProvider('google_studio').map((model) => model.id), ['gemini-3.5-flash', 'gemini-3.1-pro-preview', 'gemini-3.1-flash-lite']);

assert.deepEqual(getActiveLLMInputHandles('deepseek', 'deepseek-v4-flash'), ['text:in']);
assert.deepEqual(getActiveLLMInputHandles('Google', 'gemini-3.1-flash-lite'), ['text:in', 'image:in']);
assert.deepEqual(getActiveLLMInputHandles('google_studio', 'gemini-3.5-flash'), ['text:in', 'image:in']);
assert.deepEqual(getLLMModelsByProvider('Google').map((model) => model.id), ['gemini-3.1-flash-lite', 'gemini-3.1-pro-preview']);
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
      id: 'google_studio',
      label: 'Google Studio',
      models: [
        { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash', enabled: true, supportsImages: true, streaming: false },
      ],
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
assert.deepEqual(getLLMModelsByProvider('google_studio', specsProviders).map((model) => model.id), ['gemini-3.5-flash']);
assert.deepEqual(getActiveLLMInputHandles('openai', 'gpt-5.5', specsProviders), ['text:in', 'image:in']);
assert.equal(getLLMModelLabel('openai', 'legacy-unknown', specsProviders), 'legacy-unknown');
assert.equal(getLLMProviderLabel('legacy-provider', specsProviders), 'legacy-provider');

const loadedProviders = await fetchLLMProviders(async () => ({
  ok: true,
  json: async () => specsPayload,
}));
assert.equal(loadedProviders[0].id, 'openai');
assert.equal(loadedProviders.some((provider) => provider.id === 'google_studio'), true);

await assert.rejects(
  fetchLLMProviders(async () => ({ ok: false })),
  /Failed to load LLM specs/
);

assert.equal(
  getLLMModelsByProvider('deepseek').map((model) => model.id).join(','),
  'deepseek-v4-flash,deepseek-v4-pro',
  'fallback llmModels.js remains available when specs loading fails'
);
assert.equal(
  getLLMModelsByProvider('google_studio').map((model) => model.id).join(','),
  'gemini-3.5-flash,gemini-3.1-pro-preview,gemini-3.1-flash-lite',
  'fallback Google Studio models remain available when specs loading fails'

);
