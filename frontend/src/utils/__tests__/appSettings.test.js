import assert from 'node:assert/strict';
import {
  APP_SETTINGS_STORAGE_KEYS,
  DEFAULT_APP_SETTINGS,
  getAppSettings,
  setAppSetting,
  shouldShowRawCustomParams,
} from '../appSettings.js';

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
assert.deepEqual(
  getAppSettings(),
  DEFAULT_APP_SETTINGS,
  'default settings should keep showRawCustomParams disabled and publicAssetStorage on env default'
);
assert.equal(shouldShowRawCustomParams(getAppSettings()), false);
assert.equal(getAppSettings().publicAssetStorage, '');

globalThis.localStorage = createLocalStorageMock({
  [APP_SETTINGS_STORAGE_KEYS.showRawCustomParams]: 'true',
});
assert.equal(
  getAppSettings().showRawCustomParams,
  true,
  'localStorage true should enable showRawCustomParams'
);
assert.equal(shouldShowRawCustomParams(getAppSettings()), true);

for (const rawValue of ['', '{bad json}', '"yes"', 'null']) {
  globalThis.localStorage = createLocalStorageMock({
    [APP_SETTINGS_STORAGE_KEYS.showRawCustomParams]: rawValue,
  });
  assert.equal(
    getAppSettings().showRawCustomParams,
    false,
    `invalid localStorage value ${rawValue || '<empty>'} should fall back to false`
  );
}

globalThis.localStorage = createLocalStorageMock();
setAppSetting('publicAssetStorage', 'r2');
assert.equal(
  getAppSettings().publicAssetStorage,
  'r2',
  'publicAssetStorage should persist r2'
);

setAppSetting('publicAssetStorage', 'tos');
assert.equal(
  getAppSettings().publicAssetStorage,
  'tos',
  'publicAssetStorage should persist tos'
);

for (const rawValue of ['"s3"', 'true', 'null', 'invalid']) {
  globalThis.localStorage = createLocalStorageMock({
    [APP_SETTINGS_STORAGE_KEYS.publicAssetStorage]: rawValue,
  });
  assert.equal(
    getAppSettings().publicAssetStorage,
    '',
    `invalid publicAssetStorage value ${rawValue} should fall back to env default`
  );
}

globalThis.localStorage = createLocalStorageMock();
const existingCustomParams = { seedance: { mode: 'frame', firstFrame: '/api/image/a.png' } };
const snapshot = JSON.stringify(existingCustomParams);
setAppSetting('showRawCustomParams', false);
assert.equal(shouldShowRawCustomParams(getAppSettings()), false);
assert.equal(
  JSON.stringify(existingCustomParams),
  snapshot,
  'hiding raw custom params should not mutate existing customParams data'
);

setAppSetting('showRawCustomParams', true);
assert.equal(shouldShowRawCustomParams(getAppSettings()), true);
assert.equal(
  getAppSettings().publicAssetStorage,
  '',
  'showRawCustomParams updates should not change publicAssetStorage'
);

if (originalLocalStorage === undefined) {
  delete globalThis.localStorage;
} else {
  globalThis.localStorage = originalLocalStorage;
}

console.log('appSettings tests passed');
