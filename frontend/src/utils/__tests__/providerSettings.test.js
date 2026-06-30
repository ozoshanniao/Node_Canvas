import assert from 'node:assert/strict';
import {
  clearProviderSettings,
  fetchProviderSettings,
  normalizeProviderStatus,
  PROVIDER_FIELDS,
  saveProviderSettings,
} from '../providerSettings.js';

for (const providerId of ['kie', 'fal', 'wavespeed']) {
  assert.deepEqual(
    PROVIDER_FIELDS[providerId].map((field) => field.id),
    ['apiKey'],
    `${providerId} should expose only apiKey`
  );
  assert.equal(PROVIDER_FIELDS[providerId][0].secret, true);
  assert.equal(PROVIDER_FIELDS[providerId][0].required, true);
}
assert.deepEqual(PROVIDER_FIELDS.google_studio.map((field) => field.id), ['apiKey']);
assert.deepEqual(PROVIDER_FIELDS.kling.map((field) => field.id), ['accessKey', 'secretKey']);
assert.deepEqual(PROVIDER_FIELDS['cloudflare-r2'].map((field) => field.id), ['accessKeyId', 'secretAccessKey']);

assert.deepEqual(
  normalizeProviderStatus({
    id: 'kling',
    name: 'Kling',
    configured: true,
    source: 'settings',
    supportsSettings: true,
    requiredEnv: ['KLING_ACCESS_KEY', 'KLING_SECRET_KEY'],
    missingEnv: ['KLING_ACCESS_KEY', 'KLING_SECRET_KEY'],
    missingDependencyEnv: [],
    requiredSettings: ['accessKey', 'secretKey'],
    settingsFields: ['baseUrl'],
    publicSettings: { baseUrl: 'https://api.openai.com/v1', accessKeyId: 'must-not-be-preserved' },
    missingSettings: [],
    accessKey: 'must-not-be-preserved',
  }),
  {
    id: 'kling',
    name: 'Kling',
    configured: true,
    source: 'settings',
    supportsSettings: true,
    requiredEnv: ['KLING_ACCESS_KEY', 'KLING_SECRET_KEY'],
    missingEnv: ['KLING_ACCESS_KEY', 'KLING_SECRET_KEY'],
    missingDependencyEnv: [],
    requiredSettings: ['accessKey', 'secretKey'],
    settingsFields: ['baseUrl'],
    publicSettings: { baseUrl: 'https://api.openai.com/v1' },
    missingSettings: [],
  },
  'provider status normalization should preserve status metadata only'
);

const googleStudioStatus = normalizeProviderStatus({
  id: 'google_studio',
  name: 'Google Studio',
  configured: true,
  source: 'settings',
  supportsSettings: true,
  requiredEnv: ['GOOGLE_API_KEY or GEMINI_API_KEY'],
  requiredSettings: ['apiKey'],
  settingsFields: [],
  publicSettings: { apiKey: 'secret', project: 'must-not-exist', location: 'must-not-exist', baseUrl: 'must-not-exist' },
});
assert.equal(googleStudioStatus.id, 'google_studio');
assert.equal(googleStudioStatus.name, 'Google Studio');
assert.deepEqual(googleStudioStatus.requiredSettings, ['apiKey']);
assert.deepEqual(googleStudioStatus.settingsFields, []);
assert.equal(Object.prototype.hasOwnProperty.call(googleStudioStatus.publicSettings, 'apiKey'), false);
const providers = await fetchProviderSettings(async () => ({
  ok: true,
  json: async () => ({
    status: 'success',
    providers: [{ id: 'deepseek', name: 'DeepSeek', configured: false, source: 'none' }],
  }),
}));
assert.equal(providers[0].configured, false);

let saveRequest;
const saved = await saveProviderSettings('deepseek', { apiKey: 'fake-key' }, async (url, options) => {
  saveRequest = { url, options };
  return {
    ok: true,
    json: async () => ({
      status: 'success',
      provider: { id: 'deepseek', name: 'DeepSeek', configured: true, source: 'settings' },
    }),
  };
});
assert.equal(saveRequest.options.method, 'POST');
assert.equal(JSON.parse(saveRequest.options.body).apiKey, 'fake-key');
assert.equal(saved.source, 'settings');

let clearRequest;
const cleared = await clearProviderSettings('deepseek', async (url, options) => {
  clearRequest = { url, options };
  return {
    ok: true,
    json: async () => ({
      status: 'success',
      provider: { id: 'deepseek', name: 'DeepSeek', configured: false, source: 'none' },
    }),
  };
});
assert.equal(clearRequest.options.method, 'DELETE');
assert.equal(cleared.source, 'none');

await assert.rejects(
  fetchProviderSettings(async () => ({ ok: false })),
  /Failed to load provider settings/
);
await assert.rejects(
  saveProviderSettings('deepseek', { apiKey: 'fake-key' }, async () => ({ ok: false })),
  /Failed to save provider settings/
);

console.log('providerSettings tests passed');


let openAISaveRequest;
await saveProviderSettings('openai', { apiKey: 'fake-key', baseUrl: 'https://api.openai.com/v1' }, async (url, options) => {
  openAISaveRequest = { url, options, body: JSON.parse(options.body) };
  return {
    ok: true,
    json: async () => ({
      status: 'success',
      provider: {
        id: 'openai',
        name: 'OpenAI',
        configured: true,
        source: 'settings',
        publicSettings: { baseUrl: 'https://api.openai.com/v1' },
      },
    }),
  };
});
assert.equal(openAISaveRequest.body.apiKey, 'fake-key');
assert.equal(openAISaveRequest.body.baseUrl, 'https://api.openai.com/v1');
assert.equal(globalThis.localStorage?.getItem?.('OPENAI_API_KEY'), undefined);


let googleStudioSaveRequest;
await saveProviderSettings('google_studio', { apiKey: 'fake-studio-key' }, async (url, options) => {
  googleStudioSaveRequest = { url, options, body: JSON.parse(options.body) };
  return {
    ok: true,
    json: async () => ({
      status: 'success',
      provider: { id: 'google_studio', name: 'Google Studio', configured: true, source: 'settings' },
    }),
  };
});
assert.deepEqual(googleStudioSaveRequest.body, { apiKey: 'fake-studio-key' });
assert.equal(globalThis.localStorage?.getItem?.('GOOGLE_API_KEY'), undefined);
assert.equal(globalThis.sessionStorage?.getItem?.('GOOGLE_API_KEY'), undefined);
