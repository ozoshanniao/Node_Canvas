import { mergeNodeDefaults } from '../utils/nodeDefaults';

export const NODE_DEFINITIONS = [
  {
    type: 'textNode',
    label: 'Text Input',
    description: '文本输入节点',
    category: 'Text',
    order: 20,
    showInConnectionMenu: false,
    inputs: [{ id: 'text:in', kind: 'text' }],
    outputs: [{ id: 'text:out', kind: 'text' }],
    defaultData: { text: '', variableName: '' },
  },
  {
    type: 'textConstruction',
    label: 'Text Construction',
    description: '文本构建节点',
    category: 'Text',
    order: 30,
    showInConnectionMenu: true,
    inputs: [{ id: 'text:in', kind: 'text' }],
    outputs: [{ id: 'text:out', kind: 'text' }],
    defaultData: { template: '' },
  },
  {
    type: 'llmProcessor',
    label: 'LLM Processor',
    description: 'LLM 文本处理节点',
    category: 'AI',
    order: 10,
    showInConnectionMenu: true,
    inputs: [{ id: 'text:in', kind: 'text' }],
    outputs: [{ id: 'text:out', kind: 'text' }],
    defaultData: {
      provider: 'Yunwu',
      model: 'gemini-3.1-flash-lite-preview',
      temperature: 0.85,
      maxTokens: 65535,
      outputText: '',
      status: 'idle',
    },
    defaultsKind: 'llmProcessor',
  },
  {
    type: 'imageNode',
    label: 'Image Generation',
    description: '图片生成节点',
    category: 'Image',
    order: 15,
    showInConnectionMenu: true,
    inputs: [
      { id: 'text:prompt', kind: 'text' },
      { id: 'image:in', kind: 'image' },
    ],
    outputs: [{ id: 'image:out', kind: 'image' }],
    defaultData: { provider: 'Yunwu', model: 'Nano 2', ratio: '1:1', aspectRatio: '1:1', resolution: '1K' },
    defaultsKind: 'imageGeneration',
  },
  {
    type: 'outputNode',
    label: 'Output',
    description: '图片结果输出节点',
    category: 'Image',
    order: 25,
    showInConnectionMenu: true,
    inputs: [{ id: 'image:in', kind: 'image' }],
    outputs: [],
    defaultData: {
      selectedIndex: 0,
    },
  },
  {
    type: 'imageInputNode',
    label: 'Image Input',
    description: '图片输入节点',
    category: 'Image',
    order: 50,
    showInConnectionMenu: false,
    inputs: [],
    outputs: [{ id: 'image:out', kind: 'image' }],
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
