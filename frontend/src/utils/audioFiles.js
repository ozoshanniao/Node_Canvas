export const SUPPORTED_AUDIO_EXTENSIONS = [
  '.mp3',
  '.wav',
  '.m4a',
  '.aac',
  '.ogg',
  '.opus',
  '.flac',
  '.webm',
  '.mp4',
];

const AUDIO_EXTENSION_SET = new Set(SUPPORTED_AUDIO_EXTENSIONS);

export const getAudioFileExtension = (filename = '') => {
  const basename = String(filename || '').split(/[\\/]/).pop() || '';
  const dotIndex = basename.lastIndexOf('.');
  return dotIndex >= 0 ? basename.slice(dotIndex).toLowerCase() : '';
};

export const isSupportedAudioFile = (fileOrName) => {
  const name = typeof fileOrName === 'string' ? fileOrName : fileOrName?.name;
  return AUDIO_EXTENSION_SET.has(getAudioFileExtension(name));
};

export const naturalCompareAudioFiles = (a, b) =>
  String(a?.name || a?.filename || '').localeCompare(
    String(b?.name || b?.filename || ''),
    undefined,
    { numeric: true, sensitivity: 'base' }
  );

