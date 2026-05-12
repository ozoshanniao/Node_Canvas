const MIN_PIXELS = 655360;
const MAX_PIXELS = 8294400;
const MAX_SIDE = 3840;

export const PANORAMA_EXPORT_ASPECT_RATIOS = ['16:9', '4:3', '1:1', '9:16', '3:2', 'Custom'];
export const PANORAMA_EXPORT_RESOLUTIONS = ['1K', '2K', '4K', 'Custom'];

const LONG_SIDE_BY_RESOLUTION = {
  '1K': 1024,
  '2K': 2048,
  '4K': 3840,
};

const round16 = (value) => Math.max(16, Math.round(value / 16) * 16);

const parseAspectRatio = (aspectRatio) => {
  if (!aspectRatio || aspectRatio === 'Custom') return null;
  const [width, height] = aspectRatio.split(':').map(Number);
  if (!width || !height || width <= 0 || height <= 0) return null;
  return width / height;
};

const scaleAndRound = (width, height, scale) => ({
  width: round16(width * scale),
  height: round16(height * scale),
});

const fitPanoramaSize = (inputWidth, inputHeight) => {
  let width = round16(inputWidth);
  let height = round16(inputHeight);

  if (Math.max(width, height) > MAX_SIDE) {
    ({ width, height } = scaleAndRound(width, height, MAX_SIDE / Math.max(width, height)));
  }

  let pixels = width * height;
  if (pixels > MAX_PIXELS) {
    ({ width, height } = scaleAndRound(width, height, Math.sqrt(MAX_PIXELS / pixels)));
  }

  pixels = width * height;
  if (pixels < MIN_PIXELS) {
    ({ width, height } = scaleAndRound(width, height, Math.sqrt(MIN_PIXELS / pixels)));
  }

  for (let index = 0; width * height < MIN_PIXELS && index < 20; index += 1) {
    ({ width, height } = scaleAndRound(width, height, 1.01));
  }

  for (let index = 0; width * height > MAX_PIXELS && index < 20; index += 1) {
    ({ width, height } = scaleAndRound(width, height, 0.99));
  }

  if (Math.max(width, height) > MAX_SIDE) {
    ({ width, height } = scaleAndRound(width, height, MAX_SIDE / Math.max(width, height)));
  }

  const ratio = Math.max(width, height) / Math.min(width, height);
  const pixelsFinal = width * height;

  if (ratio > 3) {
    throw new Error('Export aspect ratio must be 3:1 or less.');
  }

  if (Math.max(width, height) > MAX_SIDE || pixelsFinal < MIN_PIXELS || pixelsFinal > MAX_PIXELS) {
    throw new Error('Export size is outside the supported range.');
  }

  return { width, height };
};

export const resolvePanoramaExportSize = ({
  aspectRatio = '16:9',
  resolution = '2K',
  customWidth,
  customHeight,
} = {}) => {
  if (aspectRatio === 'Custom' || resolution === 'Custom') {
    const width = Number(customWidth);
    const height = Number(customHeight);
    if (!width || !height || width <= 0 || height <= 0) {
      throw new Error('Custom export width and height are required.');
    }
    if (width % 16 !== 0 || height % 16 !== 0) {
      throw new Error('Custom export width and height must be multiples of 16.');
    }
    return fitPanoramaSize(width, height);
  }

  const ratio = parseAspectRatio(aspectRatio) || 16 / 9;
  const longSide = LONG_SIDE_BY_RESOLUTION[resolution] || LONG_SIDE_BY_RESOLUTION['2K'];

  if (ratio >= 1) {
    return fitPanoramaSize(longSide, longSide / ratio);
  }

  return fitPanoramaSize(longSide * ratio, longSide);
};
