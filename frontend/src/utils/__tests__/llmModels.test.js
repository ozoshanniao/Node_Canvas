import assert from 'node:assert/strict';
import {
  getActiveLLMInputHandles,
  getDefaultLLMParameters,
  getLLMModelCapabilities,
  getLLMModelsByProvider,
  getLLMProvider,
  getLLMProviderLabel,
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
