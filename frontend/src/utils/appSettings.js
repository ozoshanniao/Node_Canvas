import { useCallback, useEffect, useState } from 'react';

export const APP_SETTINGS_STORAGE_KEYS = {
  showRawCustomParams: 'nodeCanvas.settings.showRawCustomParams',
  publicAssetStorage: 'nodeCanvas.settings.publicAssetStorage',
  language: 'nodeCanvas.settings.language',
  canvasBackgroundColor: 'nodeCanvas.settings.canvasBackgroundColor',
  canvasGridColor: 'nodeCanvas.settings.canvasGridColor',
};

export const DEFAULT_APP_SETTINGS = {
  showRawCustomParams: false,
  publicAssetStorage: '',
  language: 'zh-CN',
  canvasBackgroundColor: '#0b0b0b',
  canvasGridColor: '#222222',
};

const PUBLIC_ASSET_STORAGE_VALUES = new Set(['', 'r2', 'tos']);
const LANGUAGE_VALUES = new Set(['zh-CN', 'en-US']);
const HEX_COLOR_PATTERN = /^#?[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?$/;

export const parseAndNormalizeHexColor = (value, fallback = null) => {
  if (typeof value !== 'string') return fallback;
  const trimmedValue = value.trim();
  if (!HEX_COLOR_PATTERN.test(trimmedValue)) return fallback;
  return `#${trimmedValue.replace(/^#/, '').toLowerCase()}`;
};

export const getHexColorInputValue = (value, fallback) =>
  parseAndNormalizeHexColor(value, fallback).replace(/^#/, '');

export const getColorPickerValue = (value, fallback) => {
  const normalizedValue = parseAndNormalizeHexColor(value, fallback);
  const colorValue = normalizedValue.replace(/^#/, '');
  if (colorValue.length === 3) {
    return `#${colorValue.split('').map((char) => `${char}${char}`).join('')}`;
  }
  return normalizedValue;
};

export const updateHexColorAppSetting = (updateSetting, key, value) => {
  const fallback = DEFAULT_APP_SETTINGS[key];
  return updateSetting(key, parseAndNormalizeHexColor(value, fallback));
};

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

const readHexColorSetting = (storageKey, fallback) => {
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
    return parseAndNormalizeHexColor(value, fallback);
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
  canvasBackgroundColor: readHexColorSetting(
    APP_SETTINGS_STORAGE_KEYS.canvasBackgroundColor,
    DEFAULT_APP_SETTINGS.canvasBackgroundColor
  ),
  canvasGridColor: readHexColorSetting(
    APP_SETTINGS_STORAGE_KEYS.canvasGridColor,
    DEFAULT_APP_SETTINGS.canvasGridColor
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
  } else if (key === 'canvasBackgroundColor' || key === 'canvasGridColor') {
    nextValue = parseAndNormalizeHexColor(value, DEFAULT_APP_SETTINGS[key]);
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
