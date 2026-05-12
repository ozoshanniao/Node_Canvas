const API_BASE_URL = 'http://127.0.0.1:8000';

const resolveCanvasImageUrl = (url) => {
  if (!url) return url;

  if (url.startsWith('data:image/') || url.startsWith('blob:') || /^https?:\/\//.test(url)) {
    return url;
  }

  if (url.startsWith('/api/')) {
    return `${API_BASE_URL}${url}`;
  }

  return url;
};

const getUrlOrigin = (url) => {
  if (typeof window === 'undefined') return '';
  try {
    return new URL(url, window.location.href).origin;
  } catch {
    return '';
  }
};

const shouldSetCrossOrigin = (resolvedUrl) => {
  if (!resolvedUrl) return false;
  if (resolvedUrl.startsWith('data:image/') || resolvedUrl.startsWith('blob:')) return false;

  const origin = getUrlOrigin(resolvedUrl);
  return Boolean(origin && typeof window !== 'undefined' && origin !== window.location.origin);
};

const loadImage = (imageUrl) =>
  new Promise((resolve, reject) => {
    if (!imageUrl) {
      reject(new Error('No image URL provided for grid split.'));
      return;
    }

    const resolvedUrl = resolveCanvasImageUrl(imageUrl);
    const image = new Image();
    if (shouldSetCrossOrigin(resolvedUrl)) {
      image.crossOrigin = 'anonymous';
    }

    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load image for splitting: ${resolvedUrl}`));
    image.src = resolvedUrl;
  });

export const splitImageToGrid = async ({
  imageUrl,
  rows,
  cols,
  outputType = 'image/png',
  quality = 0.95,
}) => {
  const safeRows = Number(rows);
  const safeCols = Number(cols);

  if (!Number.isInteger(safeRows) || safeRows <= 0) {
    throw new Error('Split rows must be a positive integer.');
  }

  if (!Number.isInteger(safeCols) || safeCols <= 0) {
    throw new Error('Split columns must be a positive integer.');
  }

  const image = await loadImage(imageUrl);
  const imageWidth = image.naturalWidth || image.width;
  const imageHeight = image.naturalHeight || image.height;

  if (!imageWidth || !imageHeight) {
    throw new Error('Source image has no readable dimensions.');
  }

  const tileWidth = imageWidth / safeCols;
  const tileHeight = imageHeight / safeRows;
  const slices = [];

  for (let row = 0; row < safeRows; row += 1) {
    for (let col = 0; col < safeCols; col += 1) {
      const sx = Math.floor(col * tileWidth);
      const sy = Math.floor(row * tileHeight);
      const nextX = col === safeCols - 1 ? imageWidth : Math.floor((col + 1) * tileWidth);
      const nextY = row === safeRows - 1 ? imageHeight : Math.floor((row + 1) * tileHeight);
      const sw = nextX - sx;
      const sh = nextY - sy;
      const width = sw;
      const height = sh;

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('Canvas 2D context is unavailable.');
      }

      context.drawImage(image, sx, sy, sw, sh, 0, 0, width, height);

      let url = '';
      try {
        url = canvas.toDataURL(outputType, quality);
      } catch (error) {
        throw new Error(
          `Failed to export split image. Canvas may be tainted by a cross-origin image. ${error?.message || ''}`
        );
      }

      slices.push({
        index: row * safeCols + col,
        row,
        col,
        url,
        width,
        height,
      });
    }
  }

  return slices;
};
