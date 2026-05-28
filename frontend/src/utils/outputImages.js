/**
 * Normalize image output item (either string URL or rich image object) to a unified format.
 *
 * @param {string|object} item - Upstream output image
 * @param {string} sourceNodeId - ID of the upstream source node (from edge.source)
 * @returns {object} Normalized object with:
 *   - url: string URL (normalized, empty if invalid)
 *   - sourceNodeId: string (guaranteed to be the edge.source)
 *   - other rich fields preserved (filePath, mimeType, sourceType, filename, remoteUrl, etc.)
 */
export const normalizeImageOutputItem = (item, sourceNodeId = '') => {
  if (typeof item === 'string') {
    return { url: item, sourceNodeId };
  }

  if (item && typeof item === 'object') {
    const url = typeof item.url === 'string'
      ? item.url
      : typeof item.filePath === 'string'
        ? item.filePath
        : typeof item.path === 'string'
          ? item.path
          : '';

    return {
      ...item,
      url,
      sourceNodeId, // 确保 sourceNodeId 不会被 rich object 里的同名字段覆盖
    };
  }

  return { url: '', sourceNodeId };
};
