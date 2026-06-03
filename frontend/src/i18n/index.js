import { zh_CN } from './locales/zh-CN.js';
import { en_US } from './locales/en-US.js';

export const SUPPORTED_LANGUAGES = ['zh-CN', 'en-US'];
export const DEFAULT_LANGUAGE = 'zh-CN';
export const LANGUAGE_STORAGE_KEY = 'nodeCanvas.settings.language';

const LOCALES = {
  'zh-CN': zh_CN,
  'en-US': en_US,
};

const normalizeLanguage = (value) =>
  SUPPORTED_LANGUAGES.includes(value) ? value : DEFAULT_LANGUAGE;

const readStoredLanguage = (rawValue) => {
  if (!rawValue) return DEFAULT_LANGUAGE;
  try {
    const parsed = JSON.parse(rawValue);
    if (typeof parsed === 'string') return normalizeLanguage(parsed);
  } catch {
    // Plain string values are accepted for backward compatibility.
  }
  return normalizeLanguage(rawValue);
};

export const getCurrentLanguage = () => {
  try {
    return readStoredLanguage(globalThis.localStorage?.getItem(LANGUAGE_STORAGE_KEY));
  } catch {
    return DEFAULT_LANGUAGE;
  }
};

export const t = (key, params) => {
  const language = getCurrentLanguage();
  const primaryLocale = LOCALES[language] ?? {};
  const fallbackLocale = LOCALES[DEFAULT_LANGUAGE] ?? {};
  let text = primaryLocale[key] ?? fallbackLocale[key] ?? key;

  if (params && typeof text === 'string') {
    Object.entries(params).forEach(([paramKey, value]) => {
      text = text.replaceAll(`{${paramKey}}`, String(value));
    });
  }

  return text;
};

export const translateWithLanguage = (language, key, params) => {
  const primaryLocale = LOCALES[normalizeLanguage(language)] ?? {};
  const fallbackLocale = LOCALES[DEFAULT_LANGUAGE] ?? {};
  let text = primaryLocale[key] ?? fallbackLocale[key] ?? key;

  if (params && typeof text === 'string') {
    Object.entries(params).forEach(([paramKey, value]) => {
      text = text.replaceAll(`{${paramKey}}`, String(value));
    });
  }

  return text;
};

