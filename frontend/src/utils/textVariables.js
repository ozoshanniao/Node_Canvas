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

const INLINE_VAR_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]*$/;

const createInlineVarWarning = (type, message, name) => ({
  type,
  message,
  ...(name ? { name } : {}),
});

export const parseInlineVars = (text = '') => {
  const source = String(text ?? '');
  const variables = {};
  const warnings = [];
  const openPattern = /<var="([^"]*)">/g;
  let match;

  while ((match = openPattern.exec(source)) !== null) {
    const [openTag, name] = match;
    const contentStart = match.index + openTag.length;
    const closeStart = source.indexOf('</var>', contentStart);

    if (closeStart === -1) {
      warnings.push(createInlineVarWarning(
        'unclosed_var',
        `Inline variable "${name}" is missing a closing </var> tag.`,
        name
      ));
      continue;
    }

    const content = source.slice(contentStart, closeStart);

    if (!INLINE_VAR_NAME_PATTERN.test(name)) {
      warnings.push(createInlineVarWarning(
        'invalid_var_name',
        `Inline variable name "${name}" is invalid.`,
        name
      ));
      openPattern.lastIndex = closeStart + '</var>'.length;
      continue;
    }

    if (/<var="[^"]*">/.test(content)) {
      warnings.push(createInlineVarWarning(
        'nested_var',
        `Inline variable "${name}" contains a nested <var> block, which is not supported.`,
        name
      ));
    }

    if (Object.prototype.hasOwnProperty.call(variables, name)) {
      warnings.push(createInlineVarWarning(
        'duplicate_var',
        `Inline variable "${name}" is defined more than once; the later value is used.`,
        name
      ));
    }

    variables[name] = content.trim();
    openPattern.lastIndex = closeStart + '</var>'.length;
  }

  return { variables, warnings };
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

const MEDIA_TOKEN_TYPES = ['image', 'video', 'audio'];

export const getNextMediaTokenIndex = (text = '', mediaType = '') => {
  const type = String(mediaType || '').toLowerCase();
  if (!MEDIA_TOKEN_TYPES.includes(type)) return 1;

  let maxIndex = 0;
  const pattern = new RegExp(`@${type}_?(\\d+)`, 'gi');
  String(text ?? '').replace(pattern, (_match, index) => {
    const value = Number(index);
    if (Number.isInteger(value) && value > maxIndex) {
      maxIndex = value;
    }
    return _match;
  });
  return maxIndex + 1;
};

export const getStaticMediaSuggestions = (text = '', query = '') => {
  const normalizedQuery = String(query ?? '').toLowerCase();
  return MEDIA_TOKEN_TYPES
    .filter((type) => type.startsWith(normalizedQuery))
    .map((type) => {
      const name = `${type}_${getNextMediaTokenIndex(text, type)}`;
      return {
        name,
        key: `@${name}`,
        preview: '',
        type,
      };
    });
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
      Object.assign(variables, parseInlineVars(output.text).variables);

      if (output.variableName) {
        variables[output.variableName] = output.value;
      }
    });

  return variables;
};

export const getConnectedTextVariables = (nodes = [], edges = [], currentNodeId = '') => {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const variables = [];

  edges
    .filter((edge) => edge.target === currentNodeId && (edge.targetHandle ?? edge.targetHandleId) === 'text:in')
    .map((edge) => nodeMap.get(edge.source))
    .filter((node) => node?.type === 'textNode')
    .forEach((node) => {
      const output = getTextNodeOutput(node);
      const inlineVariables = parseInlineVars(output.text).variables;

      Object.entries(inlineVariables).forEach(([name, value]) => {
        const existingIndex = variables.findIndex((item) => item.name === name);
        const item = {
          name,
          key: getVariableKey(name),
          preview: value.slice(0, 50) + (value.length > 50 ? '...' : ''),
        };

        if (existingIndex >= 0) {
          variables[existingIndex] = item;
        } else {
          variables.push(item);
        }
      });

      if (output.variableName) {
        const item = {
          name: output.variableName,
          key: output.variableKey,
          preview: output.text.slice(0, 50) + (output.text.length > 50 ? '...' : ''),
        };
        const existingIndex = variables.findIndex((candidate) => candidate.name === output.variableName);

        if (existingIndex >= 0) {
          variables[existingIndex] = item;
        } else {
          variables.push(item);
        }
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
