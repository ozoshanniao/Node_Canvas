import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_LANGUAGE,
  LANGUAGE_STORAGE_KEY,
  SUPPORTED_LANGUAGES,
  getCurrentLanguage,
  translateWithLanguage,
} from '../i18n/index.js';

const parseLanguage = (rawValue) => {
  if (!rawValue) return DEFAULT_LANGUAGE;
  try {
    const parsed = JSON.parse(rawValue);
    if (SUPPORTED_LANGUAGES.includes(parsed)) return parsed;
  } catch {
    // Storage events from older versions may contain a plain string.
  }
  return SUPPORTED_LANGUAGES.includes(rawValue) ? rawValue : DEFAULT_LANGUAGE;
};

export const useI18n = () => {
  const [language, setLanguage] = useState(getCurrentLanguage);

  useEffect(() => {
    const handleSettingsChanged = (event) => {
      const nextLanguage = event?.detail?.language;
      if (SUPPORTED_LANGUAGES.includes(nextLanguage)) {
        setLanguage(nextLanguage);
      } else {
        setLanguage(getCurrentLanguage());
      }
    };

    const handleStorageChanged = (event) => {
      if (event?.key === LANGUAGE_STORAGE_KEY) {
        setLanguage(parseLanguage(event.newValue));
      }
    };

    window.addEventListener('nodeCanvas:settingsChanged', handleSettingsChanged);
    window.addEventListener('storage', handleStorageChanged);
    return () => {
      window.removeEventListener('nodeCanvas:settingsChanged', handleSettingsChanged);
      window.removeEventListener('storage', handleStorageChanged);
    };
  }, []);

  const t = useCallback(
    (key, params) => translateWithLanguage(language, key, params),
    [language]
  );

  return { t, language };
};

