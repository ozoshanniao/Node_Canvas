import { getTextConstructionOutput, getTextNodeOutput } from './textVariables';

export const getNodeTextOutput = (node, nodes = [], edges = [], visited = new Set()) => {
  if (!node) return '';
  if (visited.has(node.id)) return '';

  if (node.type === 'textConstruction') {
    return getTextConstructionOutput(node, nodes, edges).resolvedText;
  }

  if (node.type === 'textNode') {
    return getTextNodeOutput(node).text;
  }

  if (node.type === 'llmProcessor') {
    return node.data?.outputText || node.data?.text || node.data?.output || node.data?.result || '';
  }

  if (node.type === 'routeNode') {
    const nextVisited = new Set(visited);
    nextVisited.add(node.id);
    const nodeMap = new Map(nodes.map((item) => [item.id, item]));
    const textInputEdges = edges.filter(
      (edge) => edge.target === node.id && (edge.targetHandle ?? edge.targetHandleId) === 'text:in'
    );

    for (const inputEdge of textInputEdges) {
      const text = getNodeTextOutput(nodeMap.get(inputEdge.source), nodes, edges, nextVisited);
      if (String(text ?? '').trim()) return text;
    }

    return '';
  }

  return node.data?.text ?? '';
};

export const getNodeImageOutput = (node, sourceHandle, edge, nodes = [], edges = [], visited = new Set()) => {
  if (!node) return [];
  if (visited.has(node.id)) return [];

  if (node.type === 'imageNode') {
    const urls = Array.isArray(node.data?.urls) ? node.data.urls : [];
    const selectedIndex = Number.isInteger(node.data?.selectedIndex)
      ? node.data.selectedIndex
      : Number.isInteger(node.data?.currentIndex)
        ? node.data.currentIndex
        : null;
    const selectedUrl = selectedIndex !== null ? urls[selectedIndex] : null;
    const singleUrl = node.data?.url || node.data?.imageUrl || node.data?.src;
    return [
      selectedUrl,
      ...urls,
      ...(singleUrl && !urls.includes(singleUrl) ? [singleUrl] : []),
    ].filter(Boolean);
  }

  if (node.type === 'imageInputNode') {
    const url = node.data?.url || node.data?.receivedImageUrl || node.data?.dataUrl || node.data?.imageUrl || node.data?.src;
    return url ? [url] : [];
  }

  if (node.type === 'splitGridNode') {
    const slices = Array.isArray(node.data?.slices) ? node.data.slices : [];
    const sliceIndex = edge?.data?.sliceIndex;

    if (typeof sliceIndex === 'number') {
      const slice = slices.find((item) => item?.index === sliceIndex) || slices[sliceIndex];
      return slice?.url ? [slice.url] : [];
    }

    if (slices.length > 0) {
      return slices.map((item) => item?.url).filter(Boolean);
    }

    const previewImageUrl = node.data?.previewImageUrl || node.data?.sourceImageUrl;
    return previewImageUrl ? [previewImageUrl] : [];
  }

  if (node.type === 'outputNode') {
    const images = Array.isArray(node.data?.images) ? node.data.images : [];
    return images.map((item) => (typeof item === 'string' ? item : item?.url)).filter(Boolean);
  }

  if (node.type === 'routeNode') {
    const nextVisited = new Set(visited);
    nextVisited.add(node.id);
    const nodeMap = new Map(nodes.map((item) => [item.id, item]));
    const imageInputEdges = edges.filter(
      (inputEdge) => inputEdge.target === node.id && (inputEdge.targetHandle ?? inputEdge.targetHandleId) === 'image:in'
    );

    return imageInputEdges
      .flatMap((inputEdge) =>
        getNodeImageOutput(nodeMap.get(inputEdge.source), inputEdge.sourceHandle, inputEdge, nodes, edges, nextVisited)
      )
      .filter(Boolean);
  }

  return [];
};
