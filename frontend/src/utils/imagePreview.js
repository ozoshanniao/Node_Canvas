import { resolveImageUrl } from './resolveImageUrl';

export function getBestPreviewUrl(source) {
  if (!source) return '';

  if (typeof source === 'string') {
    return source;
  }

  return (
    source.previewUrl ||
    source.thumbnailUrl ||
    source.displayUrl ||
    source.url ||
    source.dataUrl ||
    source.imageUrl ||
    source.src ||
    ''
  );
}

export function getMatchingPreviewUrl(source, originalUrl = '') {
  if (!source) return originalUrl || '';

  if (source.previewUrl && (!source.previewSourceUrl || source.previewSourceUrl === originalUrl)) {
    return source.previewUrl;
  }

  if (source.thumbnailUrl && (!source.thumbnailSourceUrl || source.thumbnailSourceUrl === originalUrl)) {
    return source.thumbnailUrl;
  }

  return originalUrl || getBestPreviewUrl(source);
}

export function createImageThumbnail(url, options = {}) {
  const sourceUrl = resolveImageUrl(url);
  if (!sourceUrl) return Promise.resolve(null);

  const maxWidth = options.maxWidth ?? 512;
  const maxHeight = options.maxHeight ?? 512;
  const quality = options.quality ?? 0.82;
  const mimeType = options.mimeType ?? 'image/webp';

  return new Promise((resolve) => {
    const image = new Image();

    if (!sourceUrl.startsWith('data:image/') && !sourceUrl.startsWith('blob:')) {
      image.crossOrigin = 'anonymous';
    }

    image.onload = () => {
      try {
        const naturalWidth = image.naturalWidth || image.width;
        const naturalHeight = image.naturalHeight || image.height;

        if (!naturalWidth || !naturalHeight) {
          resolve(null);
          return;
        }

        const scale = Math.min(1, maxWidth / naturalWidth, maxHeight / naturalHeight);
        if (scale >= 1 && sourceUrl.startsWith('data:image/') && sourceUrl.length < 220_000) {
          resolve(null);
          return;
        }

        const width = Math.max(1, Math.round(naturalWidth * scale));
        const height = Math.max(1, Math.round(naturalHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const context = canvas.getContext('2d', { alpha: true });
        if (!context) {
          resolve(null);
          return;
        }

        context.drawImage(image, 0, 0, width, height);

        let dataUrl = canvas.toDataURL(mimeType, quality);
        if (!dataUrl || dataUrl === 'data:,') {
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        }

        resolve(dataUrl && dataUrl !== 'data:,' ? dataUrl : null);
      } catch (error) {
        console.warn('[image preview] thumbnail failed', {
          reason: error?.message || String(error),
          urlPrefix: sourceUrl.startsWith('data:image/') ? `${sourceUrl.slice(0, 40)}...` : sourceUrl.slice(0, 120),
        });
        resolve(null);
      }
    };

    image.onerror = () => resolve(null);
    image.src = sourceUrl;
  });
}
