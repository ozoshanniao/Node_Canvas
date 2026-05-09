import { getTextConstructionOutput, getTextNodeOutput } from './textVariables';

export const getNodeTextOutput = (node, nodes = [], edges = []) => {
  if (!node) return '';

  if (node.type === 'textConstruction') {
    return getTextConstructionOutput(node, nodes, edges).resolvedText;
  }

  if (node.type === 'textNode') {
    return getTextNodeOutput(node).text;
  }

  return node.data?.text ?? '';
};
