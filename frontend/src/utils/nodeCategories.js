export const DOCK_CATEGORIES = [
  {
    id: 'Text',
    label: 'Text',
    nodeTypes: ['textNode', 'textConstruction', 'llmProcessor'],
  },
  {
    id: 'Image',
    label: 'Image',
    nodeTypes: ['imageInputNode', 'imageNode', 'outputNode', 'imageCompareNode'],
  },
  {
    id: 'Video',
    label: 'Video',
    nodeTypes: ['videoInputNode', 'videoNode', 'shotListNode', 'omniComposerNode'],
  },
  {
    id: 'Audio',
    label: 'Audio',
    nodeTypes: ['audioInputNode'],
  },
  {
    id: 'Tools',
    label: 'Tools',
    nodeTypes: ['splitGridNode', 'routeNode', 'ar720Node', 'panorama360Node', 'easeCurveNode'],
  },
];

export const RUNNABLE_NODE_TYPES = new Set([
  'imageNode',
  'videoNode',
  'easeCurveNode',
  'llmProcessor',
  'splitGridNode',
]);

export const getDockCategoryNodes = (category, definitions = []) => {
  const definitionMap = new Map(definitions.map((definition) => [definition.type, definition]));
  return category.nodeTypes
    .map((type) => definitionMap.get(type))
    .filter(Boolean);
};
