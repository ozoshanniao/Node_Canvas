import { getTextConstructionOutput, getTextNodeOutput } from './textVariables';

export const getNodeTextOutput = (node, nodes = [], edges = []) => {
  if (!node) return '';

  if (node.type === 'textConstruction') {
    return getTextConstructionOutput(node, nodes, edges).resolvedText;
  }

  if (node.type === 'textNode') {
    return getTextNodeOutput(node).text;
  }

  if (node.type === 'llmProcessor') {
    return node.data?.outputText ?? '';
  }

  return node.data?.text ?? '';
};

export const getNodeImageOutput = (node) => {
  if (!node) return [];

  if (node.type === 'imageNode') {
    const urls = Array.isArray(node.data?.urls) ? node.data.urls : [];
    const singleUrl = node.data?.url;
    return [...urls, ...(singleUrl && !urls.includes(singleUrl) ? [singleUrl] : [])].filter(Boolean);
  }

  if (node.type === 'imageInputNode') {
    const url = node.data?.url || node.data?.dataUrl || node.data?.imageUrl || node.data?.src;
    return url ? [url] : [];
  }

  if (node.type === 'outputNode') {
    const images = Array.isArray(node.data?.images) ? node.data.images : [];
    return images.map((item) => item?.url).filter(Boolean);
  }

  return [];
};
