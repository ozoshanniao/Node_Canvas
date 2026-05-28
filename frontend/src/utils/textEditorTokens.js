export const MEDIA_TOKEN_TYPES = new Set(['image', 'video', 'audio']);

export const ZERO_WIDTH_CARET = '\u200B';

export const isMediaTokenName = (value = '') => /^(image|video|audio)_\d+$/.test(String(value));

export const mediaTokenToText = (tokenName = '') => `@${tokenName}`;

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
      if (part.type === 'token' && isMediaTokenName(part.name)) return mediaTokenToText(part.name);
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
