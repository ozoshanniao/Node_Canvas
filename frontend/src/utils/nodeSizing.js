export const parseAspectRatio = (ratio = '1:1') => {
  const [rawWidth, rawHeight] = String(ratio || '1:1').split(':').map(Number);
  const widthRatio = Number.isFinite(rawWidth) && rawWidth > 0 ? rawWidth : 1;
  const heightRatio = Number.isFinite(rawHeight) && rawHeight > 0 ? rawHeight : 1;
  return { widthRatio, heightRatio };
};

export const DEFAULT_VIDEO_INPUT_ASPECT_RATIO = '16:9';
export const DEFAULT_VIDEO_INPUT_SIZE = { width: 360, height: 203 };
export const VIDEO_INPUT_SIZE_LIMITS = {
  minWidth: 220,
  minHeight: 120,
  maxWidth: 520,
  maxHeight: 360,
};

export const getImageNodeAspectRatio = (data = {}) => data.aspectRatio || data.ratio || '1:1';

export const getImageNodeSizeByAspectRatio = (
  ratio,
  { maxSide = 520, minSide = 280, squareSide = 420 } = {}
) => {
  const { widthRatio, heightRatio } = parseAspectRatio(ratio);

  if (widthRatio === heightRatio) {
    return { width: squareSide, height: squareSide };
  }

  if (widthRatio > heightRatio) {
    return {
      width: maxSide,
      height: Math.max(minSide, Math.round((maxSide * heightRatio) / widthRatio)),
    };
  }

  return {
    width: Math.max(minSide, Math.round((maxSide * widthRatio) / heightRatio)),
    height: maxSide,
  };
};

export const hasValidNodeSize = (node = {}) =>
  Number.isFinite(node.width) && node.width > 0 && Number.isFinite(node.height) && node.height > 0;

const gcd = (a, b) => {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y) {
    const next = x % y;
    x = y;
    y = next;
  }
  return x || 1;
};

export const getAspectRatioFromDimensions = (width, height, fallback = DEFAULT_VIDEO_INPUT_ASPECT_RATIO) => {
  const naturalWidth = Number(width);
  const naturalHeight = Number(height);
  if (!Number.isFinite(naturalWidth) || !Number.isFinite(naturalHeight) || naturalWidth <= 0 || naturalHeight <= 0) {
    return fallback;
  }

  const divisor = gcd(naturalWidth, naturalHeight);
  return `${Math.round(naturalWidth / divisor)}:${Math.round(naturalHeight / divisor)}`;
};

export const getAspectRatioNumber = (ratio = DEFAULT_VIDEO_INPUT_ASPECT_RATIO) => {
  const { widthRatio, heightRatio } = parseAspectRatio(ratio || DEFAULT_VIDEO_INPUT_ASPECT_RATIO);
  return widthRatio / heightRatio;
};

export const getVideoInputNodeAspectRatio = (data = {}) =>
  data.aspectRatio || getAspectRatioFromDimensions(data.naturalWidth, data.naturalHeight);

export const getVideoInputNodeSizeByAspectRatio = (
  ratio = DEFAULT_VIDEO_INPUT_ASPECT_RATIO,
  {
    width = DEFAULT_VIDEO_INPUT_SIZE.width,
    minWidth = VIDEO_INPUT_SIZE_LIMITS.minWidth,
    minHeight = VIDEO_INPUT_SIZE_LIMITS.minHeight,
    maxWidth = VIDEO_INPUT_SIZE_LIMITS.maxWidth,
    maxHeight = VIDEO_INPUT_SIZE_LIMITS.maxHeight,
  } = {}
) => {
  const numericRatio = getAspectRatioNumber(ratio);
  const safeRatio = Number.isFinite(numericRatio) && numericRatio > 0 ? numericRatio : 16 / 9;
  let nextWidth = Math.min(maxWidth, Math.max(minWidth, Number(width) || DEFAULT_VIDEO_INPUT_SIZE.width));
  let nextHeight = Math.round(nextWidth / safeRatio);

  if (nextHeight > maxHeight) {
    nextHeight = maxHeight;
    nextWidth = Math.round(nextHeight * safeRatio);
  }

  if (nextHeight < minHeight) {
    nextHeight = minHeight;
    nextWidth = Math.round(nextHeight * safeRatio);
  }

  if (nextWidth < minWidth) {
    nextWidth = minWidth;
    nextHeight = Math.round(nextWidth / safeRatio);
  }

  return {
    width: nextWidth,
    height: nextHeight,
  };
};
