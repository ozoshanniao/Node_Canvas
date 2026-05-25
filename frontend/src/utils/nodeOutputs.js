import { getTextConstructionOutput, getTextNodeOutput } from './textVariables.js';

export const getNodeTextOutput = (node, nodes = [], edges = [], visited = new Set()) => {
  if (!node) return '';
  if (visited.has(node.id)) return '';

  if (node.type === 'textConstruction') {
    return getTextConstructionOutput(node, nodes, edges).resolvedText;
  }

  if (node.type === 'textNode') {
    return getTextNodeOutput(node).text;
  }

  if (node.type === 'llmProcessor') {
    return node.data?.outputText || node.data?.text || node.data?.output || node.data?.result || '';
  }

  if (node.type === 'routeNode') {
    const nextVisited = new Set(visited);
    nextVisited.add(node.id);
    const nodeMap = new Map(nodes.map((item) => [item.id, item]));
    const textInputEdges = edges.filter(
      (edge) => edge.target === node.id && (edge.targetHandle ?? edge.targetHandleId) === 'text:in'
    );

    for (const inputEdge of textInputEdges) {
      const text = getNodeTextOutput(nodeMap.get(inputEdge.source), nodes, edges, nextVisited);
      if (String(text ?? '').trim()) return text;
    }

    return '';
  }

  return node.data?.text ?? '';
};

export const getNodeImageOutput = (node, sourceHandle, edge, nodes = [], edges = [], visited = new Set()) => {
  if (!node) return [];
  if (visited.has(node.id)) return [];

  if (node.type === 'imageNode') {
    const urls = Array.isArray(node.data?.urls) ? node.data.urls : [];
    const selectedIndex = Number.isInteger(node.data?.selectedIndex)
      ? node.data.selectedIndex
      : Number.isInteger(node.data?.currentIndex)
        ? node.data.currentIndex
        : null;
    const selectedUrl = selectedIndex !== null ? urls[selectedIndex] : null;
    const singleUrl = node.data?.url || node.data?.imageUrl || node.data?.src;
    return [
      selectedUrl,
      ...urls,
      ...(singleUrl && !urls.includes(singleUrl) ? [singleUrl] : []),
    ].filter(Boolean);
  }

  if (node.type === 'imageInputNode') {
    const url = node.data?.url || node.data?.receivedImageUrl || node.data?.dataUrl || node.data?.imageUrl || node.data?.src;
    return url ? [url] : [];
  }

  if (node.type === 'splitGridNode') {
    const slices = Array.isArray(node.data?.slices) ? node.data.slices : [];
    const sliceIndex = edge?.data?.sliceIndex;

    if (typeof sliceIndex === 'number') {
      const slice = slices.find((item) => item?.index === sliceIndex) || slices[sliceIndex];
      return slice?.url ? [slice.url] : [];
    }

    if (slices.length > 0) {
      return slices.map((item) => item?.url).filter(Boolean);
    }

    const previewImageUrl = node.data?.previewImageUrl || node.data?.sourceImageUrl;
    return previewImageUrl ? [previewImageUrl] : [];
  }

  if (node.type === 'outputNode') {
    const images = Array.isArray(node.data?.images) ? node.data.images : [];
    return images.map((item) => (typeof item === 'string' ? item : item?.url)).filter(Boolean);
  }

  if (node.type === 'routeNode') {
    const nextVisited = new Set(visited);
    nextVisited.add(node.id);
    const nodeMap = new Map(nodes.map((item) => [item.id, item]));
    const imageInputEdges = edges.filter(
      (inputEdge) => inputEdge.target === node.id && (inputEdge.targetHandle ?? inputEdge.targetHandleId) === 'image:in'
    );

    return imageInputEdges
      .flatMap((inputEdge) =>
        getNodeImageOutput(nodeMap.get(inputEdge.source), inputEdge.sourceHandle, inputEdge, nodes, edges, nextVisited)
      )
      .filter(Boolean);
  }

  return [];
};

export const getNodeMultiPromptOutput = (node) => {
  if (!node || node.type !== 'shotListNode') {
    return {
      totalDuration: 0,
      multiPrompt: [],
      isValid: false,
      errors: ['Multi-shot customize requires a ShotList input.'],
    };
  }

  const shots = Array.isArray(node.data?.shots) ? node.data.shots : [];
  const errors = [];
  if (shots.length < 1) errors.push('ShotList requires at least one shot.');
  if (shots.length > 6) errors.push('ShotList supports up to 6 shots.');

  const multiPrompt = shots.map((shot, index) => {
    const prompt = String(shot?.prompt || '').trim();
    const duration = Number(shot?.duration);
    if (!prompt) errors.push(`Shot ${index + 1} prompt is required.`);
    if (prompt.length > 512) errors.push(`Shot ${index + 1} prompt must be 512 characters or less.`);
    if (!Number.isInteger(duration)) errors.push(`Shot ${index + 1} duration must be an integer.`);
    if (Number.isInteger(duration) && duration < 1) errors.push(`Shot ${index + 1} duration must be at least 1s.`);
    return {
      index: index + 1,
      prompt,
      duration: String(Number.isInteger(duration) ? duration : 0),
    };
  });

  const totalDuration = multiPrompt.reduce((sum, shot) => sum + Number(shot.duration || 0), 0);
  if (totalDuration < 3 || totalDuration > 15) {
    errors.push('ShotList total duration must be between 3s and 15s.');
  }

  return {
    totalDuration,
    multiPrompt,
    isValid: errors.length === 0,
    errors,
  };
};

const replaceOmniPromptAliases = (prompt = '') =>
  String(prompt || '').replace(/@(image|element|video)_(\d+)/g, (_, type, index) => `<<<${type}_${index}>>>`);

const getOmniPromptReferences = (prompt = '') => {
  const references = [];
  String(prompt || '').replace(/@(image|element|video)_(\d+)/g, (match, type, index) => {
    references.push({ token: match, alias: `${type}_${index}` });
    return match;
  });
  String(prompt || '').replace(/<<<(image|element|video)_(\d+)>>>/g, (match, type, index) => {
    references.push({ token: match, alias: `${type}_${index}` });
    return match;
  });
  return references;
};

export const getNodeOmniParamsOutput = (node, edges = [], nodes = []) => {
  if (!node || node.type !== 'omniComposerNode') {
    return {
      type: 'omniParams',
      prompt: '',
      resolvedPrompt: '',
      images: [],
      videos: [],
      elements: [],
      isValid: false,
      errors: ['Omni Composer input is required for Kling V3 Omni.'],
    };
  }

  const nodeMap = new Map(nodes.map((item) => [item.id, item]));
  const multiShot = Boolean(node.data?.multiShot);
  const rawShotType = node.data?.shotType || 'intelligence';
  const shotMode = multiShot && rawShotType === 'customize'
    ? 'customize'
    : multiShot
      ? 'intelligence'
      : 'single';
  const inputEdges = edges
    .filter((edge) => edge.target === node.id && (edge.targetHandle ?? edge.targetHandleId) === 'image:references')
    .map((edge, order) => ({ edge, order }))
    .sort((a, b) => {
      const aIndex = typeof a.edge.data?.imageIndex === 'number' ? a.edge.data.imageIndex : a.order;
      const bIndex = typeof b.edge.data?.imageIndex === 'number' ? b.edge.data.imageIndex : b.order;
      return aIndex - bIndex;
    });

  const imageRoles = node.data?.imageRoles || {};
  const images = inputEdges
    .map(({ edge }, index) => {
      const alias = `image_${index + 1}`;
      const role = ['reference', 'first_frame', 'end_frame'].includes(imageRoles[alias])
        ? imageRoles[alias]
        : 'reference';
      const urls = getNodeImageOutput(nodeMap.get(edge.source), edge.sourceHandle, edge, nodes, edges);
      const url = urls[0];
      if (!url) return null;
      return {
        alias,
        url,
        role,
        sourceNodeId: edge.source,
        sourceHandle: edge.sourceHandle ?? edge.sourceHandleId ?? '',
      };
    })
    .filter(Boolean);

  const rawElements = Array.isArray(node.data?.elements) ? node.data.elements : [''];
  const errors = [];
  const elementValues = rawElements
    .map((value) => String(value ?? '').trim())
    .filter(Boolean);

  if (elementValues.length > 3) {
    errors.push('Kling element_list supports at most 3 elements.');
  }

  const elements = elementValues.slice(0, 3).map((value, index) => {
    if (!/^\d+$/.test(value)) {
      errors.push('Invalid Kling element ID.');
    }
    return {
      alias: `element_${index + 1}`,
      elementId: Number(value),
    };
  });

  const prompt = String(node.data?.prompt || '').trim();
  if (shotMode !== 'customize' && !prompt) {
    errors.push('Kling Omni prompt is required.');
  }

  const firstFrames = images.filter((image) => image.role === 'first_frame');
  const endFrames = images.filter((image) => image.role === 'end_frame');
  if (firstFrames.length > 1) errors.push('Kling Omni supports at most one first_frame image.');
  if (endFrames.length > 1) errors.push('Kling Omni supports at most one end_frame image.');
  if (endFrames.length > 0 && firstFrames.length === 0) {
    errors.push('Kling Omni end_frame requires a first_frame image.');
  }
  if (images.length + elements.length > 7) {
    errors.push('Kling Omni image and element references support at most 7 total items.');
  }

  const aliases = new Set([
    ...images.map((image) => image.alias),
    ...elements.map((element) => element.alias),
  ]);
  const validatePromptReferences = (value) => {
    getOmniPromptReferences(value).forEach((reference) => {
      if (!aliases.has(reference.alias)) {
        errors.push(`Unknown Omni reference: ${reference.token}`);
      }
    });
  };
  validatePromptReferences(prompt);

  let multiPrompt = [];
  let durationSeconds = null;
  let duration = '';
  if (shotMode === 'customize') {
    const multiPromptEdge = edges.find(
      (edge) => edge.target === node.id && (edge.targetHandle ?? edge.targetHandleId) === 'multiPrompt:in'
    );
    if (!multiPromptEdge) {
      errors.push('Omni multi-shot customize requires a ShotList input.');
    } else {
      const shotOutput = getNodeMultiPromptOutput(nodeMap.get(multiPromptEdge.source));
      if (!shotOutput?.isValid) {
        errors.push(shotOutput?.errors?.[0] || 'ShotList input is invalid.');
      } else {
        durationSeconds = shotOutput.totalDuration;
        duration = `${shotOutput.totalDuration}s`;
        if (durationSeconds < 3 || durationSeconds > 15) {
          errors.push('Kling Omni multi-shot duration must be between 3 and 15 seconds.');
        }
        multiPrompt = shotOutput.multiPrompt.map((shot) => {
          validatePromptReferences(shot.prompt);
          return {
            ...shot,
            resolvedPrompt: replaceOmniPromptAliases(shot.prompt),
          };
        });
      }
    }
  }

  return {
    type: 'omniParams',
    prompt,
    resolvedPrompt: replaceOmniPromptAliases(prompt),
    shotMode,
    multiShot,
    multiPrompt,
    durationSeconds,
    duration,
    images,
    videos: [],
    elements,
    isValid: errors.length === 0,
    errors,
  };
};
