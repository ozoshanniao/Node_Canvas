import assert from 'node:assert/strict';
import {
  APP_SETTINGS_STORAGE_KEYS,
  DEFAULT_APP_SETTINGS,
  getColorPickerValue,
  getAppSettings,
  getHexColorInputValue,
  parseAndNormalizeHexColor,
  setAppSetting,
  shouldShowRawCustomParams,
  updateHexColorAppSetting,
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
assert.equal(getAppSettings().language, 'zh-CN');
assert.equal(getAppSettings().canvasBackgroundColor, '#0b0b0b');
assert.equal(getAppSettings().canvasGridColor, '#222222');

assert.equal(parseAndNormalizeHexColor('abc'), '#abc');
assert.equal(parseAndNormalizeHexColor('#ABCDEF'), '#abcdef');
assert.equal(parseAndNormalizeHexColor('  0B0B0B  '), '#0b0b0b');
assert.equal(parseAndNormalizeHexColor('bad-value', '#123456'), '#123456');
assert.equal(parseAndNormalizeHexColor('12', '#123456'), '#123456');
assert.equal(parseAndNormalizeHexColor('#1234', '#123456'), '#123456');
assert.equal(parseAndNormalizeHexColor(null, '#123456'), '#123456');
assert.equal(getHexColorInputValue('#0B0B0B', '#000000'), '0b0b0b');
assert.equal(getColorPickerValue('#222', '#000000'), '#222222');

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

setAppSetting('language', 'en-US');
assert.equal(
  getAppSettings().language,
  'en-US',
  'language should persist en-US'
);

setAppSetting('language', 'zh-CN');
assert.equal(
  getAppSettings().language,
  'zh-CN',
  'language should persist zh-CN'
);

setAppSetting('canvasBackgroundColor', '1A2B3C');
assert.equal(
  getAppSettings().canvasBackgroundColor,
  '#1a2b3c',
  'canvasBackgroundColor should persist normalized six-digit colors'
);

setAppSetting('canvasGridColor', '#ABC');
assert.equal(
  getAppSettings().canvasGridColor,
  '#abc',
  'canvasGridColor should persist normalized three-digit colors'
);

setAppSetting('canvasBackgroundColor', 'not-a-color');
assert.equal(
  getAppSettings().canvasBackgroundColor,
  DEFAULT_APP_SETTINGS.canvasBackgroundColor,
  'invalid canvasBackgroundColor should fall back to the default color'
);

setAppSetting('canvasGridColor', '#12');
assert.equal(
  getAppSettings().canvasGridColor,
  DEFAULT_APP_SETTINGS.canvasGridColor,
  'invalid canvasGridColor should fall back to the default color'
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

for (const rawValue of ['"fr-FR"', 'true', 'null', 'invalid']) {
  globalThis.localStorage = createLocalStorageMock({
    [APP_SETTINGS_STORAGE_KEYS.language]: rawValue,
  });
  assert.equal(
    getAppSettings().language,
    'zh-CN',
    `invalid language value ${rawValue} should fall back to zh-CN`
  );
}

for (const rawValue of ['"ABCDEF"', '"#a1B2c3"', '#654321']) {
  globalThis.localStorage = createLocalStorageMock({
    [APP_SETTINGS_STORAGE_KEYS.canvasBackgroundColor]: rawValue,
  });
  assert.match(
    getAppSettings().canvasBackgroundColor,
    /^#[0-9a-f]{6}$/,
    `valid stored canvas color ${rawValue} should be normalized`
  );
}

for (const rawValue of ['"1234"', 'true', 'null', 'invalid']) {
  globalThis.localStorage = createLocalStorageMock({
    [APP_SETTINGS_STORAGE_KEYS.canvasGridColor]: rawValue,
  });
  assert.equal(
    getAppSettings().canvasGridColor,
    DEFAULT_APP_SETTINGS.canvasGridColor,
    `invalid canvasGridColor value ${rawValue} should fall back to default`
  );
}

const colorSettingUpdates = [];
const updateSettingSpy = (key, value) => {
  colorSettingUpdates.push({ key, value });
  return { [key]: value };
};
updateHexColorAppSetting(updateSettingSpy, 'canvasBackgroundColor', 'F0F');
updateHexColorAppSetting(updateSettingSpy, 'canvasGridColor', '#123456');
updateHexColorAppSetting(updateSettingSpy, 'canvasGridColor', 'invalid');
assert.deepEqual(
  colorSettingUpdates,
  [
    { key: 'canvasBackgroundColor', value: '#f0f' },
    { key: 'canvasGridColor', value: '#123456' },
    { key: 'canvasGridColor', value: DEFAULT_APP_SETTINGS.canvasGridColor },
  ],
  'text input and color swatch updates should normalize values before updating settings'
);

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
