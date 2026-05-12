export const resolveImageUrl = (url) => {
  if (!url || typeof url !== 'string') return '';

  if (
    url.startsWith('data:image/') ||
    url.startsWith('blob:') ||
    url.startsWith('http://') ||
    url.startsWith('https://')
  ) {
    return url;
  }

  if (url.startsWith('/api/')) {
    return `http://127.0.0.1:8000${url}`;
  }

  return url;
};
