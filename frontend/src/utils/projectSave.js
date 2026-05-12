export const describeImageValue = (value) => {
  if (!value) return { type: 'empty', length: 0 };
  if (typeof value !== 'string') return { type: typeof value, length: 0 };
  if (value.startsWith('data:image/')) return { type: 'dataURL', length: value.length, preview: value.slice(0, 80) };
  if (value.startsWith('blob:')) return { type: 'blobURL', length: value.length, preview: value.slice(0, 80) };
  if (value.startsWith('http://') || value.startsWith('https://')) return { type: 'httpURL', length: value.length, preview: value.slice(0, 80) };
  return { type: 'filePathOrOther', length: value.length, preview: value.slice(0, 80) };
};

export const sanitizeNodesForSave = (nodes = []) =>
  nodes.map((node) => {
    const { selected, dragging, resizing, ...persistedNode } = node;
    const data = { ...(persistedNode.data || {}) };

    delete data.file;
    delete data.flowing;
    delete data.isLoading;
    delete data.status;
    delete data.error;
    delete data.progress;
    delete data.hover;
    delete data.resolvedText;

    // Strip base64 image fields - images are now stored as relative paths
    delete data.dataUrl;
    delete data.previewUrl;
    delete data.previewSourceUrl;
    delete data.thumbnailUrl;
    delete data.fittedSourceUrl;

    // Strip base64 from images array if present
    if (Array.isArray(data.images)) {
      data.images = data.images.map((img) => {
        if (!img || typeof img !== 'object') return img;
        const { dataUrl, previewUrl, previewSourceUrl, thumbnailUrl, ...restImg } = img;
        return restImg;
      });
    }

    if (node.type === 'imageInputNode' && data.url?.startsWith?.('blob:')) {
      console.warn('[project:save image warning]', {
        nodeId: node.id,
        type: node.type,
        reason: 'blob URL is not persistent and will not be saved as url',
        preview: data.url.slice(0, 80),
      });
      delete data.url;
    }

    return { ...persistedNode, data };
  });

export const sanitizeEdgesForSave = (edges = []) =>
  edges.map((edge) => {
    const { selected, animated, className, ...persistedEdge } = edge;
    const data = { ...(persistedEdge.data || {}) };
    delete data.flowing;
    return { ...persistedEdge, type: 'default', data };
  });

export const sanitizeProjectBeforeSave = ({ nodes = [], edges = [] }) => ({
  nodes: sanitizeNodesForSave(nodes),
  edges: sanitizeEdgesForSave(edges),
});

export const saveProjectCore = async ({ projectPath, projectFilePath, projectName, nodes, edges, reason = 'manual' }) => {
  if (!projectPath) {
    return { ok: false, error: 'Missing projectPath' };
  }

  const sanitized = sanitizeProjectBeforeSave({ nodes, edges });

  try {
    const response = await fetch('http://127.0.0.1:8000/api/project/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: projectPath,
        projectFilePath,
        projectName,
        nodes: sanitized.nodes,
        edges: sanitized.edges,
        reason,
      }),
    });

    if (!response.ok) {
      const message = await response.text();
      return { ok: false, error: message || `HTTP ${response.status}` };
    }

    return { ok: true, savedAt: new Date(), reason };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
};
