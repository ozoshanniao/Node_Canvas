import assert from 'node:assert/strict';
import { getActiveLLMInputHandles, getLLMModelCapabilities } from '../llmModels.js';
import { sanitizeNodeDefaults } from '../nodeDefaults.js';
import {
  fetchLLMSkills,
  getEnabledSkillsForPayload,
  getSkillDisplayName,
  normalizeEnabledSkills,
  shouldRenderLocalSkillsPanel,
} from '../llmSkills.js';

const originalFetch = globalThis.fetch;

const skills = [
  {
    id: 'prompt-refiner',
    name: 'Prompt Refiner',
    description: 'Rewrite rough prompts.',
    source: 'global',
    type: 'soft',
  },
  {
    id: 'orange-cat-style',
    name: 'Orange Cat Style',
    description: 'Rules for orange cats.',
    source: 'project',
    type: 'soft',
  },
];

globalThis.fetch = async (url) => {
  assert.equal(
    url,
    'http://127.0.0.1:8000/api/llm/skills?projectPath=C%3A%5Cproject%20one'
  );
  return {
    ok: true,
    json: async () => skills,
  };
};

assert.deepEqual(await fetchLLMSkills('C:\\project one'), skills);
assert.equal(skills[0].source, 'global');
assert.equal(skills[1].source, 'project');

assert.deepEqual(
  normalizeEnabledSkills(['missing', 'orange-cat-style', 'prompt-refiner'], skills),
  ['orange-cat-style', 'prompt-refiner']
);

assert.equal(getSkillDisplayName(skills[0]), 'Prompt Refiner');
assert.equal(getSkillDisplayName({ id: 'fallback-name' }), 'fallback-name');

assert.deepEqual(
  sanitizeNodeDefaults('llmProcessor', { enabledSkills: [] }).enabledSkills,
  []
);

const deepseekPayload = {
  provider: 'deepseek',
  model: 'deepseek-v4-flash',
  inputText: 'hello',
  imageInputs: [],
  projectPath: '',
  enabledSkills: getEnabledSkillsForPayload(['prompt-refiner'], true),
  temperature: 0.85,
  maxTokens: 8192,
};
assert.deepEqual(deepseekPayload.enabledSkills, ['prompt-refiner']);

const googlePayload = {
  provider: 'Google',
  model: 'gemini-3.1-flash-lite',
  inputText: 'hello',
  imageInputs: [],
  projectPath: '',
  temperature: 0.85,
  maxTokens: 8192,
};
assert.deepEqual(getEnabledSkillsForPayload(['prompt-refiner'], false), []);
assert.equal('enabledSkills' in googlePayload, false);
assert.equal(shouldRenderLocalSkillsPanel(true), true);
assert.equal(shouldRenderLocalSkillsPanel(false), false);

const deepseekCapabilities = getLLMModelCapabilities('deepseek', 'deepseek-v4-flash');
assert.equal(deepseekCapabilities.supportsImages, false);
assert.equal(deepseekCapabilities.supportsLocalSoftSkills, true);
assert.deepEqual(getActiveLLMInputHandles('deepseek', 'deepseek-v4-flash'), ['text:in']);

for (const providerId of ['Google', 'Yunwu']) {
  const capabilities = getLLMModelCapabilities(providerId, 'gemini-3.1-flash-lite');
  assert.equal(capabilities.supportsLocalSoftSkills, false);
  assert.equal(capabilities.supportsImages, true);
  assert.equal(shouldRenderLocalSkillsPanel(capabilities.supportsLocalSoftSkills), false);
}

globalThis.fetch = async () => ({
  ok: false,
  status: 500,
  json: async () => ({ detail: 'bad skills' }),
});
await assert.rejects(fetchLLMSkills, /bad skills/);

globalThis.fetch = originalFetch;

console.log('llmSkills tests passed');
