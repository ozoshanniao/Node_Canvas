export const MEDIA_TOKEN_TYPES = new Set(['image', 'video', 'audio']);

export const ZERO_WIDTH_CARET = '\u200B';

export const isMediaTokenName = (value = '') => /^(image|video|audio)_\d+$/.test(String(value));

export const normalizeTokenValue = (value = '') => {
  return String(value ?? '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\u00A0/g, ' ')
    .trim()
    .replace(/^@+/, '')
    .trim()
    .replace(/\s+/g, '');
};

export const mediaTokenToText = (tokenName = '') => `@${normalizeTokenValue(tokenName)}`;

export const isTextVarTokenName = (value = '') => /^[A-Za-z_][A-Za-z0-9_-]*$/.test(String(value));

export const textVarTokenToText = (tokenName = '') => `@${normalizeTokenValue(tokenName)}`;

export const tokenNameToText = (tokenName = '', tokenType = 'media') => {
  if (tokenType === 'text-var') return textVarTokenToText(tokenName);
  return mediaTokenToText(tokenName);
};

export const isValidTokenNameForType = (value = '', tokenType = 'media') => {
  const normalized = normalizeTokenValue(value);
  if (tokenType === 'text-var') return isTextVarTokenName(normalized);
  return isMediaTokenName(normalized);
};

export const normalizeEditorTokens = (text = '', tokens) => {
  const value = String(text ?? '');
  if (!Array.isArray(tokens)) return [];

  return tokens
    .map((token) => {
      if (!token || typeof token !== 'object') return null;
      const type = token.type || 'media';
      const name = normalizeTokenValue(token.value ?? token.name ?? '');
      const start = Number(token.start);
      const end = Number(token.end);
      const tokenText = tokenNameToText(name, type);

      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start) return null;
      if (!isValidTokenNameForType(name, type)) return null;
      if (value.slice(start, end) !== tokenText) return null;

      return {
        id: String(token.id || `${type}:${name}:${start}:${end}`),
        type,
        value: name,
        start,
        end,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start);
};

export const editorPartsFromTextAndTokens = (text = '', tokens) => {
  const value = String(text ?? '');
  const normalizedTokens = normalizeEditorTokens(value, tokens);
  const parts = [];
  let cursor = 0;

  normalizedTokens.forEach((token) => {
    if (token.start < cursor) return;
    if (token.start > cursor) {
      parts.push({ type: 'text', text: value.slice(cursor, token.start) });
    }
    parts.push({
      type: 'token',
      id: token.id,
      tokenType: token.type,
      value: token.value,
      start: token.start,
      end: token.end,
    });
    cursor = token.end;
  });

  if (cursor < value.length) {
    parts.push({ type: 'text', text: value.slice(cursor) });
  }

  if (parts.length === 0) {
    parts.push({ type: 'text', text: value });
  }

  return parts;
};

export const createEditorTokenMetadata = ({ id, type = 'media', value = '', start = 0 }) => {
  const normalizedValue = normalizeTokenValue(value);
  const tokenText = tokenNameToText(normalizedValue, type);
  return {
    id: String(id || `${type}:${normalizedValue}:${start}:${start + tokenText.length}`),
    type,
    value: normalizedValue,
    start,
    end: start + tokenText.length,
  };
};

export const plainTextToEditorParts = (text = '') => [
  {
    type: 'text',
    text: String(text ?? ''),
  },
];

export const serializeEditorParts = (parts = []) =>
  parts
    .map((part) => {
      if (!part || typeof part !== 'object') return '';
      const tokenValue = normalizeTokenValue(part.name ?? part.value);
      if (part.type === 'token' && isValidTokenNameForType(tokenValue, part.tokenType ?? part.type)) {
        return tokenNameToText(tokenValue, part.tokenType ?? part.type);
      }
      return String(part.text ?? '');
    })
    .join('');

export const insertAutocompleteMediaTokenText = (text = '', start = 0, end = 0, tokenName = '') => {
  const value = String(text ?? '');
  const safeStart = Math.max(0, Math.min(Number(start) || 0, value.length));
  const safeEnd = Math.max(safeStart, Math.min(Number(end) || safeStart, value.length));
  return `${value.slice(0, safeStart)}${mediaTokenToText(tokenName)}${value.slice(safeEnd)}`;
};

export const deleteEditorPartAt = (parts = [], index = -1) => {
  if (index < 0 || index >= parts.length) return parts.slice();
  return parts.filter((_part, partIndex) => partIndex !== index);
};
