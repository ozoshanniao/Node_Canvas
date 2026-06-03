import { useCallback, useEffect, useState } from 'react';

export const APP_SETTINGS_STORAGE_KEYS = {
  showRawCustomParams: 'nodeCanvas.settings.showRawCustomParams',
  publicAssetStorage: 'nodeCanvas.settings.publicAssetStorage',
  language: 'nodeCanvas.settings.language',
};

export const DEFAULT_APP_SETTINGS = {
  showRawCustomParams: false,
  publicAssetStorage: '',
  language: 'zh-CN',
};

const PUBLIC_ASSET_STORAGE_VALUES = new Set(['', 'r2', 'tos']);
const LANGUAGE_VALUES = new Set(['zh-CN', 'en-US']);

const readBooleanSetting = (storageKey, fallback) => {
  try {
    const rawValue = globalThis.localStorage?.getItem(storageKey);
    if (rawValue === null || rawValue === undefined || rawValue === '') return fallback;
    if (rawValue === 'true') return true;
    if (rawValue === 'false') return false;
    const parsed = JSON.parse(rawValue);
    return typeof parsed === 'boolean' ? parsed : fallback;
  } catch {
    return fallback;
  }
};

const readStringSetting = (storageKey, fallback, allowedValues = null) => {
  try {
    const rawValue = globalThis.localStorage?.getItem(storageKey);
    if (rawValue === null || rawValue === undefined) return fallback;
    let value = rawValue;
    try {
      const parsed = JSON.parse(rawValue);
      if (typeof parsed === 'string') value = parsed;
    } catch {
      value = rawValue;
    }
    if (typeof value !== 'string') return fallback;
    return !allowedValues || allowedValues.has(value) ? value : fallback;
  } catch {
    return fallback;
  }
};

export const getAppSettings = () => ({
  showRawCustomParams: readBooleanSetting(
    APP_SETTINGS_STORAGE_KEYS.showRawCustomParams,
    DEFAULT_APP_SETTINGS.showRawCustomParams
  ),
  publicAssetStorage: readStringSetting(
    APP_SETTINGS_STORAGE_KEYS.publicAssetStorage,
    DEFAULT_APP_SETTINGS.publicAssetStorage,
    PUBLIC_ASSET_STORAGE_VALUES
  ),
  language: readStringSetting(
    APP_SETTINGS_STORAGE_KEYS.language,
    DEFAULT_APP_SETTINGS.language,
    LANGUAGE_VALUES
  ),
});

export const shouldShowRawCustomParams = (settings = getAppSettings()) =>
  Boolean(settings?.showRawCustomParams);

export const setAppSetting = (key, value) => {
  if (!Object.prototype.hasOwnProperty.call(DEFAULT_APP_SETTINGS, key)) {
    return getAppSettings();
  }

  let nextValue = value;
  if (key === 'showRawCustomParams') {
    nextValue = Boolean(value);
  } else if (key === 'publicAssetStorage') {
    nextValue = PUBLIC_ASSET_STORAGE_VALUES.has(value) ? value : DEFAULT_APP_SETTINGS.publicAssetStorage;
  } else if (key === 'language') {
    nextValue = LANGUAGE_VALUES.has(value) ? value : DEFAULT_APP_SETTINGS.language;
  }
  try {
    globalThis.localStorage?.setItem(APP_SETTINGS_STORAGE_KEYS[key], JSON.stringify(nextValue));
  } catch {
    // Settings should never break the canvas if storage is unavailable.
  }

  const nextSettings = {
    ...getAppSettings(),
    [key]: nextValue,
  };

  try {
    globalThis.window?.dispatchEvent?.(
      new CustomEvent('nodeCanvas:settingsChanged', { detail: nextSettings })
    );
  } catch {
    // Older or test runtimes may not support CustomEvent.
  }

  return nextSettings;
};

export const useAppSettings = () => {
  const [settings, setSettings] = useState(() => getAppSettings());

  useEffect(() => {
    const handleSettingsChanged = (event) => {
      setSettings(event?.detail || getAppSettings());
    };
    const handleStorageChanged = (event) => {
      if (!event?.key || Object.values(APP_SETTINGS_STORAGE_KEYS).includes(event.key)) {
        setSettings(getAppSettings());
      }
    };

    window.addEventListener('nodeCanvas:settingsChanged', handleSettingsChanged);
    window.addEventListener('storage', handleStorageChanged);
    return () => {
      window.removeEventListener('nodeCanvas:settingsChanged', handleSettingsChanged);
      window.removeEventListener('storage', handleStorageChanged);
    };
  }, []);

  const updateSetting = useCallback((key, value) => {
    const nextSettings = setAppSetting(key, value);
    setSettings(nextSettings);
    return nextSettings;
  }, []);

  return [settings, updateSetting];
};
