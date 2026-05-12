import { resolveImageUrl } from './resolveImageUrl';

export const IMAGE_INPUT_BASE_SIZE = 320;
export const IMAGE_INPUT_MIN_SIZE = 120;

export function getImageInputNodeSizeByRatio(width, height, options = {}) {
  const baseSize = options.baseSize ?? IMAGE_INPUT_BASE_SIZE;
  const minSize = options.minSize ?? IMAGE_INPUT_MIN_SIZE;
  const safeWidth = Number(width) || 1;
  const safeHeight = Number(height) || 1;
  const ratio = safeWidth / safeHeight;

  if (!ratio || !Number.isFinite(ratio)) {
    return {
      width: baseSize,
      height: baseSize,
    };
  }

  if (ratio >= 1) {
    return {
      width: baseSize,
      height: Math.max(minSize, Math.round(baseSize / ratio)),
    };
  }

  return {
    width: Math.max(minSize, Math.round(baseSize * ratio)),
    height: baseSize,
  };
}

export function getImageInputNodeSizeFromImageUrl(url, options = {}) {
  return new Promise((resolve, reject) => {
    const resolvedUrl = resolveImageUrl(url);
    if (!resolvedUrl) {
      resolve(getImageInputNodeSizeByRatio(1, 1, options));
      return;
    }

    const image = new Image();
    if (!resolvedUrl.startsWith('data:image/') && !resolvedUrl.startsWith('blob:')) {
      image.crossOrigin = 'anonymous';
    }
    image.onload = () => {
      resolve(getImageInputNodeSizeByRatio(image.naturalWidth, image.naturalHeight, options));
    };
    image.onerror = reject;
    image.src = resolvedUrl;
  });
}
