/**
 * Resolve image URL for display
 *
 * Handles:
 * - Relative paths: input/xxx.png, generation/xxx.png, generation/ease_curve/xxx.mp4
 * - API paths: /api/image/xxx, /api/input/xxx
 * - Absolute URLs: http://, https://
 * - Data URLs: data:image/...
 * - Blob URLs: blob:...
 *
 * @param {string} url - Image URL or path
 * @param {string} projectPath - Optional project path for query params
 * @returns {string} Resolved absolute URL
 */
export const resolveImageUrl = (url, projectPath = null) => {
  if (!url || typeof url !== 'string') return '';

  // Already absolute URLs - return as-is
  if (
    url.startsWith('data:image/') ||
    url.startsWith('data:video/') ||
    url.startsWith('blob:') ||
    url.startsWith('http://') ||
    url.startsWith('https://')
  ) {
    return url;
  }

  // API paths - convert to full URL
  if (url.startsWith('/api/')) {
    const baseUrl = 'http://127.0.0.1:8000';
    if (projectPath && !url.includes('projectPath=')) {
      const separator = url.includes('?') ? '&' : '?';
      return `${baseUrl}${url}${separator}projectPath=${encodeURIComponent(projectPath)}`;
    }
    return `${baseUrl}${url}`;
  }

  // Relative paths: input/xxx.png or generation/xxx.png
  if (url.startsWith('input/')) {
    const filename = url.substring('input/'.length);
    const baseUrl = 'http://127.0.0.1:8000';
    if (projectPath) {
      return `${baseUrl}/api/input/${filename}?projectPath=${encodeURIComponent(projectPath)}`;
    }
    return `${baseUrl}/api/input/${filename}`;
  }

  if (url.startsWith('generation/')) {
    const filename = url.substring('generation/'.length);
    const baseUrl = 'http://127.0.0.1:8000';
    if (filename.includes('/')) {
      if (projectPath) {
        return `${baseUrl}/api/generation/${filename}?projectPath=${encodeURIComponent(projectPath)}`;
      }
      return `${baseUrl}/api/generation/${filename}`;
    }
    if (projectPath) {
      return `${baseUrl}/api/image/${filename}?projectPath=${encodeURIComponent(projectPath)}`;
    }
    return `${baseUrl}/api/image/${filename}`;
  }

  // Fallback: treat as relative path and assume it's in generation
  // (for backward compatibility with old /api/image/xxx format)
  return url;
};
