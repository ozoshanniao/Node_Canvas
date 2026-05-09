export const normalizeVariableName = (input) => {
  const value = String(input ?? '').trim();
  return value.startsWith('@') ? value.slice(1).trim() : value;
};

export const getVariableKey = (variableName) => {
  const normalized = normalizeVariableName(variableName);
  return normalized ? `@${normalized}` : '';
};

export const getTextNodeOutput = (node) => {
  const text = node?.data?.text ?? node?.data?.content ?? node?.data?.value ?? node?.data?.prompt ?? '';
  const variableName = normalizeVariableName(node?.data?.variableName);

  return {
    text,
    variableName,
    variableKey: getVariableKey(variableName),
    value: text,
  };
};

// Replaces @variables with connected Text node values. Unknown variables are intentionally preserved.
export const resolveTextTemplate = (template = '', variables = {}) =>
  String(template ?? '').replace(/@([A-Za-z0-9_\u4e00-\u9fa5]+)/g, (match, variableName) => {
    return Object.prototype.hasOwnProperty.call(variables, variableName) ? variables[variableName] : match;
  });

// Reads Text-node variables from incoming text edges. Later edges win on duplicate variable names.
export const collectTextVariablesFromInputs = (currentNodeId, nodes = [], edges = []) => {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const variables = {};

  edges
    .filter((edge) => edge.target === currentNodeId && (edge.targetHandle ?? edge.targetHandleId) === 'text:in')
    .forEach((edge) => {
      const upstreamNode = nodeMap.get(edge.source);
      if (!upstreamNode || upstreamNode.type !== 'textNode') return;

      const output = getTextNodeOutput(upstreamNode);
      if (output.variableName) {
        variables[output.variableName] = output.value;
      }
    });

  return variables;
};

export const getTextConstructionOutput = (node, nodes = [], edges = []) => {
  const template = node?.data?.template ?? node?.data?.text ?? '';
  const variables = collectTextVariablesFromInputs(node?.id, nodes, edges);

  return {
    template,
    variables,
    resolvedText: resolveTextTemplate(template, variables),
  };
};
