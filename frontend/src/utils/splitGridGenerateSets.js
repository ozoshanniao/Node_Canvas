import { createDefaultNodeData } from '../nodes/nodeDefinitions';
import { normalizeImageGenerationSettings } from './imageGenerationOptions';
import { getImageNodeAspectRatio, getImageNodeSizeByAspectRatio } from './nodeSizing';

const CELL_WIDTH = 900;
const CELL_HEIGHT = 620;

const IMAGE_INPUT_BASE_SIZE = 320;
const IMAGE_INPUT_FALLBACK_SIZE = 260;

const GROUP_OFFSETS = {
  imageInput: { x: 0, y: 0 },
  textNode: { x: 0, y: 330 },
  imageNode: { x: 390, y: 90 },
};

const getNodeRight = (node) => node.position.x + (node.width || 320);

const buildId = (prefix, splitGridId, batchId, index) =>
  `${prefix}-${splitGridId}-${batchId}-${index}`;

const getSliceFittedNodeSize = (slice) => {
  const ratio =
    slice?.width && slice?.height
      ? slice.width / slice.height
      : 1;

  if (!ratio || !Number.isFinite(ratio)) {
    return {
      width: IMAGE_INPUT_FALLBACK_SIZE,
      height: IMAGE_INPUT_FALLBACK_SIZE,
    };
  }

  if (ratio >= 1) {
    return {
      width: IMAGE_INPUT_BASE_SIZE,
      height: Math.round(IMAGE_INPUT_BASE_SIZE / ratio),
    };
  }

  return {
    width: Math.round(IMAGE_INPUT_BASE_SIZE * ratio),
    height: IMAGE_INPUT_BASE_SIZE,
  };
};

export const buildSplitGridGenerateSets = ({
  splitGridNode,
  rows,
  cols,
  defaultPrompt = '',
  generateSettings = {},
  existingNodes = [],
  imageNodeType = 'imageNode',
  projectPath,
}) => {
  const safeRows = Number(rows) || 0;
  const safeCols = Number(cols) || 0;
  const count = safeRows * safeCols;

  if (!splitGridNode?.id || count <= 0) {
    return {
      nodesToAdd: [],
      edgesToAdd: [],
      meta: { count: 0, rows: safeRows, cols: safeCols },
    };
  }

  const batchId = `${Date.now()}-${existingNodes.length}`;
  const splitGridRight = getNodeRight(splitGridNode);
  const originX = splitGridRight + 80;
  const originY = splitGridNode.position.y;
  const nodesToAdd = [];
  const edgesToAdd = [];

  for (let index = 0; index < count; index += 1) {
    const row = Math.floor(index / safeCols);
    const col = index % safeCols;
    const anchorX = originX + col * CELL_WIDTH;
    const anchorY = originY + row * CELL_HEIGHT;

    const imageInputId = buildId('imageInputNode', splitGridNode.id, batchId, index);
    const textNodeId = buildId('textNode', splitGridNode.id, batchId, index);
    const imageNodeId = buildId(imageNodeType, splitGridNode.id, batchId, index);
    const slice = Array.isArray(splitGridNode.data?.slices) ? splitGridNode.data.slices[index] : null;
    const imageInputSize = getSliceFittedNodeSize(slice);

    const textData = {
      ...createDefaultNodeData('textNode', projectPath),
      text: defaultPrompt || '',
    };

    const imageInputData = {
      ...createDefaultNodeData('imageInputNode', projectPath),
      displayMode: 'cover',
      generatedBySplitGrid: true,
      sliceIndex: index,
    };

    const normalizedSettings = normalizeImageGenerationSettings(generateSettings);
    const imageNodeData = {
      ...createDefaultNodeData(imageNodeType, projectPath),
      provider: normalizedSettings.provider,
      model: normalizedSettings.model,
      aspectRatio: normalizedSettings.aspectRatio,
      ratio: normalizedSettings.aspectRatio,
      resolution: normalizedSettings.resolution,
    };
    const imageNodeSize = getImageNodeSizeByAspectRatio(getImageNodeAspectRatio(imageNodeData));

    nodesToAdd.push(
      {
        id: imageInputId,
        type: 'imageInputNode',
        position: {
          x: anchorX + GROUP_OFFSETS.imageInput.x,
          y: anchorY + GROUP_OFFSETS.imageInput.y,
        },
        data: imageInputData,
        width: imageInputSize.width,
        height: imageInputSize.height,
      },
      {
        id: textNodeId,
        type: 'textNode',
        position: {
          x: anchorX + GROUP_OFFSETS.textNode.x,
          y: anchorY + GROUP_OFFSETS.textNode.y,
        },
        data: textData,
      },
      {
        id: imageNodeId,
        type: imageNodeType,
        position: {
          x: anchorX + GROUP_OFFSETS.imageNode.x,
          y: anchorY + GROUP_OFFSETS.imageNode.y,
        },
        data: imageNodeData,
        ...imageNodeSize,
      }
    );

    edgesToAdd.push(
      {
        id: `${splitGridNode.id}-image-out-${imageInputId}-image-in`,
        source: splitGridNode.id,
        sourceHandle: 'image:out',
        target: imageInputId,
        targetHandle: 'image:in',
        type: 'default',
        data: {
          sliceIndex: index,
        },
      },
      {
        id: `${imageInputId}-image-out-${imageNodeId}-image-in`,
        source: imageInputId,
        sourceHandle: 'image:out',
        target: imageNodeId,
        targetHandle: 'image:in',
        type: 'default',
      },
      {
        id: `${textNodeId}-text-out-${imageNodeId}-text-prompt`,
        source: textNodeId,
        sourceHandle: 'text:out',
        target: imageNodeId,
        targetHandle: 'text:prompt',
        type: 'default',
      }
    );
  }

  return {
    nodesToAdd,
    edgesToAdd,
    meta: {
      count,
      rows: safeRows,
      cols: safeCols,
      originX,
      originY,
      batchId,
    },
  };
};
