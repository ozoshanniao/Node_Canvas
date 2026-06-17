export const STABLE_VIDEO_INPUT_HANDLES = [
  'text:prompt',
  'image:firstFrame',
  'image:lastFrame',
  'image:references',
  'video:references',
  'audio:references',
  'omniParams:in',
];

export const STABLE_VIDEO_OUTPUT_HANDLES = ['video:out'];

const HANDLE_FALLBACKS = {
  'text:prompt': { type: 'text', role: 'prompt', label: 'Prompt' },
  'image:firstFrame': { type: 'image', role: 'first_frame', label: 'First Frame' },
  'image:lastFrame': { type: 'image', role: 'last_frame', label: 'Last Frame' },
  'image:references': { type: 'image', role: 'reference', label: 'Image References' },
  'video:references': { type: 'video', role: 'reference', label: 'Video References' },
  'audio:references': { type: 'audio', role: 'reference', label: 'Audio References' },
  'omniParams:in': { type: 'object', role: 'omni_params', label: 'Omni Params' },
  'video:out': { type: 'video', role: 'generated_video', label: 'Video Out' },
};

export const getStableVideoHandles = () => ({
  inputs: [...STABLE_VIDEO_INPUT_HANDLES],
  outputs: [...STABLE_VIDEO_OUTPUT_HANDLES],
});

export const buildVideoSchemaSnapshot = (capability = null) => {
  if (!capability) return null;
  const parameterSummary = {};
  Object.entries(capability.parameters || {}).forEach(([key, parameter]) => {
    const summary = {
      type: parameter?.type,
      group: parameter?.group,
      default: parameter?.default,
    };
    if (Array.isArray(parameter?.options)) summary.options = [...parameter.options];
    parameterSummary[key] = summary;
  });

  return {
    schemaVersion: capability.schemaVersion,
    provider: capability.provider,
    model: capability.model,
    displayName: capability.displayName,
    family: capability.family,
    mediaType: capability.mediaType,
    taskTypes: [...(capability.taskTypes || [])],
    inputCapabilities: structuredClone(capability.inputCapabilities || {}),
    outputCapabilities: structuredClone(capability.outputCapabilities || {}),
    parameterSummary,
    featured: Boolean(capability.featured),
    experimental: Boolean(capability.experimental),
    deprecated: Boolean(capability.deprecated),
  };
};

export const getVideoCapability = (capabilities = [], provider, model, taskType = null) => {
  if (!Array.isArray(capabilities)) return null;
  const matches = capabilities.filter(
    (capability) => capability?.provider === provider && capability?.model === model
  );
  if (!matches.length) return null;
  if (!taskType) return matches[0];
  return matches.find((capability) => capability.taskType === taskType || capability.taskTypes?.includes(taskType)) || matches[0];
};

export const getInputCapability = (capability, handleId) =>
  capability?.inputCapabilities?.[handleId] || null;

export const getOutputCapability = (capability, handleId) =>
  capability?.outputCapabilities?.[handleId] || null;

export const getParameterSchema = (capability, paramName) =>
  capability?.parameters?.[paramName] || null;

export const getHandleState = (capability, handleId) => {
  const isOutput = STABLE_VIDEO_OUTPUT_HANDLES.includes(handleId);
  const rawCapability = isOutput ? getOutputCapability(capability, handleId) : getInputCapability(capability, handleId);
  const fallback = HANDLE_FALLBACKS[handleId] || { type: handleId.split(':')[0] || '', role: '', label: handleId };

  if (!capability) {
    return {
      handleId,
      ...fallback,
      supported: isOutput,
      required: isOutput,
      status: isOutput ? 'required' : 'unsupported',
      missingCapability: true,
    };
  }

  if (!rawCapability) {
    return {
      handleId,
      ...fallback,
      supported: false,
      required: false,
      status: 'unsupported',
    };
  }

  const supported = rawCapability.supported !== false;
  const required = supported && rawCapability.required === true;
  return {
    handleId,
    ...fallback,
    ...rawCapability,
    supported,
    required,
    status: supported ? (required ? 'required' : 'optional') : 'unsupported',
  };
};

export const isHandleSupported = (capability, handleId) =>
  getHandleState(capability, handleId).supported;

export const isHandleRequired = (capability, handleId) =>
  getHandleState(capability, handleId).required;
