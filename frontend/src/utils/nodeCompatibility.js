import { NODE_DEFINITIONS, getNodeDefinition } from '../nodes/nodeDefinitions';

export const getHandleKind = (handleId = '') => {
  if (!handleId || typeof handleId !== 'string') return '';
  return handleId.split(':')[0] || '';
};

export const getCompatibleNodeDefinitions = (sourceHandle) => {
  const sourceKind = getHandleKind(sourceHandle);
  if (!sourceKind) return [];

  const filtered = NODE_DEFINITIONS.filter((definition) => {
    if (definition.showInConnectionMenu === false) return false;

    return (definition.inputs || []).some((input) => input.kind === sourceKind);
  });

  const seen = new Set();
  const unique = [];

  for (const definition of filtered) {
    if (seen.has(definition.type)) continue;
    seen.add(definition.type);
    unique.push(definition);
  }

  return unique.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
};

export const getCompatibleTargetHandle = (nodeType, sourceHandle) => {
  const sourceKind = getHandleKind(sourceHandle);
  if (!sourceKind) return null;

  const definition = getNodeDefinition(nodeType);
  const targetInput = (definition?.inputs || []).find((input) => input.kind === sourceKind);
  return targetInput?.id || null;
};

export const groupNodeDefinitionsByCategory = (definitions = []) =>
  definitions.reduce((groups, definition) => {
    const category = definition.category || 'Other';
    return {
      ...groups,
      [category]: [...(groups[category] || []), definition],
    };
  }, {});
