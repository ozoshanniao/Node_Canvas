import { mergeNodeDefaults } from '../utils/nodeDefaults';

export const NODE_DEFINITIONS = [
  {
    type: 'textNode',
    label: 'Text Input',
    description: '文本输入节点',
    defaultData: { text: '', variableName: '' },
  },
  {
    type: 'textConstruction',
    label: 'Text Construction',
    description: '文本构建节点',
    defaultData: { template: '' },
  },
  {
    type: 'imageNode',
    label: 'Image Generation',
    description: '图片生成节点',
    defaultData: { provider: 'Yunwu', model: 'Nano 2', ratio: '1:1', aspectRatio: '1:1', resolution: '1K' },
    defaultsKind: 'imageGeneration',
  },
  {
    type: 'imageInputNode',
    label: 'Image Input',
    description: '图片输入节点',
    defaultData: {},
  },
];

export const getNodeDefinition = (type) => NODE_DEFINITIONS.find((definition) => definition.type === type);

export const createDefaultNodeData = (type, projectPath) => ({
  projectPath,
  ...(getNodeDefinition(type)?.defaultsKind
    ? mergeNodeDefaults(getNodeDefinition(type).defaultsKind, getNodeDefinition(type)?.defaultData || {})
    : getNodeDefinition(type)?.defaultData || {}),
});
