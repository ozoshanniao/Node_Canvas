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

// Get all available variable names from TextNode nodes
export const getAllAvailableVariables = (nodes = []) => {
  const variables = [];
  nodes.forEach((node) => {
    if (node.type === 'textNode') {
      const output = getTextNodeOutput(node);
      if (output.variableName) {
        variables.push({
          name: output.variableName,
          key: output.variableKey,
          preview: output.text.slice(0, 50) + (output.text.length > 50 ? '...' : ''),
        });
      }
    }
  });
  return variables;
};

// Get missing variables from template
export const getMissingVariables = (template = '', variables = {}) => {
  const missing = new Set();
  String(template ?? '').replace(/@([A-Za-z0-9_\u4e00-\u9fa5]+)/g, (match, variableName) => {
    if (!Object.prototype.hasOwnProperty.call(variables, variableName)) {
      missing.add(variableName);
    }
    return match;
  });
  return Array.from(missing);
};

// Parse @token at cursor position
export const parseAtTokenAtCursor = (text = '', cursorPos = 0) => {
  if (cursorPos < 0 || cursorPos > text.length) return null;

  // Find the @ symbol before cursor
  let atPos = -1;
  for (let i = cursorPos - 1; i >= 0; i--) {
    if (text[i] === '@') {
      atPos = i;
      break;
    }
    // Stop if we hit whitespace or newline
    if (/\s/.test(text[i])) {
      break;
    }
  }

  if (atPos === -1) return null;

  // Extract the token from @ to cursor
  const token = text.slice(atPos, cursorPos);

  // Validate token format: @[A-Za-z0-9_\u4e00-\u9fa5]*
  if (!/^@[A-Za-z0-9_\u4e00-\u9fa5]*$/.test(token)) return null;

  return {
    token,
    start: atPos,
    end: cursorPos,
    query: token.slice(1), // Remove @
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
