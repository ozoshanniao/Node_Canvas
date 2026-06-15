import assert from 'node:assert/strict';
import {
  DEFAULT_LANGUAGE,
  getCurrentLanguage,
  t,
  translateWithLanguage,
} from '../index.js';
import { zh_CN } from '../locales/zh-CN.js';
import { en_US } from '../locales/en-US.js';

const createLocalStorageMock = (initial = {}) => {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => {
      store.set(key, String(value));
    },
    removeItem: (key) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
};

const originalLocalStorage = globalThis.localStorage;

globalThis.localStorage = createLocalStorageMock();
assert.equal(getCurrentLanguage(), DEFAULT_LANGUAGE, 'default language should be zh-CN');
assert.equal(t('settings.title'), '设置', 'default language should translate to zh-CN');

globalThis.localStorage = createLocalStorageMock({
  'nodeCanvas.settings.language': JSON.stringify('en-US'),
});
assert.equal(getCurrentLanguage(), 'en-US', 'JSON string language should be read from appSettings storage');
assert.equal(t('settings.title'), 'Settings', 'en-US should translate UI text');

globalThis.localStorage = createLocalStorageMock({
  'nodeCanvas.settings.language': 'en-US',
});
assert.equal(getCurrentLanguage(), 'en-US', 'plain string language should remain backward compatible');

assert.equal(
  translateWithLanguage('en-US', 'missing.translation.key'),
  'missing.translation.key',
  'missing keys should fall back to the key'
);
assert.equal(
  translateWithLanguage('en-US', 'node.video.status.queuedAt', { position: 3 }),
  'Queued · #3',
  'params should be interpolated'
);
assert.equal(
  translateWithLanguage('fr-FR', 'settings.title'),
  '设置',
  'unsupported language should fall back to zh-CN'
);

// 验证两个语言包 key 一致性
const zhKeys = Object.keys(zh_CN);
const enKeys = Object.keys(en_US);

for (const key of zhKeys) {
  assert.ok(en_US[key] !== undefined, `Key "${key}" exists in zh-CN but is missing in en-US`);
}
for (const key of enKeys) {
  assert.ok(zh_CN[key] !== undefined, `Key "${key}" exists in en-US but is missing in zh-CN`);
}

const requiredSettingsKeys = [
  'settings.title',
  'settings.tab.general',
  'settings.tab.canvas',
  'settings.tab.storage',
  'settings.tab.providers',
  'settings.tab.about',
  'settings.language',
  'settings.developerMode',
  'settings.showRawCustomParams',
  'settings.canvasBackgroundColor',
  'settings.canvasGridColor',
  'settings.publicAssetStorage',
  'settings.close',
];

for (const key of requiredSettingsKeys) {
  assert.notEqual(translateWithLanguage('zh-CN', key), key, `Settings key "${key}" should exist in zh-CN`);
  assert.notEqual(translateWithLanguage('en-US', key), key, `Settings key "${key}" should exist in en-US`);
}

if (originalLocalStorage === undefined) {
  delete globalThis.localStorage;
} else {
  globalThis.localStorage = originalLocalStorage;
}

assert.equal(translateWithLanguage('en-US', 'nodeDef.annotateNode.label'), 'Image Annotate');

console.log('i18n tests passed');
