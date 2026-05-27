import { useCallback, useEffect, useState } from 'react';

export const APP_SETTINGS_STORAGE_KEYS = {
  showRawCustomParams: 'nodeCanvas.settings.showRawCustomParams',
};

export const DEFAULT_APP_SETTINGS = {
  showRawCustomParams: false,
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

export const getAppSettings = () => ({
  showRawCustomParams: readBooleanSetting(
    APP_SETTINGS_STORAGE_KEYS.showRawCustomParams,
    DEFAULT_APP_SETTINGS.showRawCustomParams
  ),
});

export const shouldShowRawCustomParams = (settings = getAppSettings()) =>
  Boolean(settings?.showRawCustomParams);

export const setAppSetting = (key, value) => {
  if (!Object.prototype.hasOwnProperty.call(DEFAULT_APP_SETTINGS, key)) {
    return getAppSettings();
  }

  const nextValue = key === 'showRawCustomParams' ? Boolean(value) : value;
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
