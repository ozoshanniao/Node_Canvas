import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Handle, Position, useEdges, useNodes, useReactFlow, useUpdateNodeInternals } from '@xyflow/react';
import { GenerationPreviewOverlay } from '../components/GenerationPreviewOverlay';
import { NodeResizeCorner } from '../components/NodeResizeCorner';
import CustomSelect from '../components/CustomSelect';
import { DynamicAdvancedParams } from '../components/DynamicAdvancedParams';
import { ParameterInput } from '../components/ParameterInput';
import { useVideoTask } from '../hooks/useVideoTask';
import { setLastNodeDefaults } from '../utils/nodeDefaults';
import { buildSyncedVideoParamsPatch } from '../utils/videoNodeData';
import {
  getNodeAudioOutput,
  getNodeImageOutput,
  getNodeMultiPromptOutput,
  getNodeOmniParamsOutput,
  getNodeTextOutput,
  getNodeVideoOutput,
} from '../utils/nodeOutputs';
import {
  VIDEO_GENERATION_REGISTRY,
  VIDEO_MODE_OPTIONS,
  fetchVideoGenerationRegistry,
  getActiveVideoHandlesForMode,
  getEffectiveVideoMode,
  getKlingShotMode,
  getVideoModelConfig,
  getVideoProvider,
  isVideoTaskActive,
  isVideoTaskRecoverable,
  isKlingOmniModel,
  isSeedanceModel,
  normalizeVideoGenerationSettings,
  resolveKlingOmniElements,
  shouldRenderVideoToolbarParam,
  supportsKlingMultiShot,
} from '../utils/videoGenerationOptions';
import {
  buildVideoSchemaSnapshot,
  getHandleState,
  getParameterSchema,
  getStableVideoHandles,
  getVideoCapability,
} from '../utils/videoCapabilities';
import { shouldShowRawCustomParams, useAppSettings } from '../utils/appSettings';
import { countRender } from '../utils/perfDebug';
import { useI18n } from '../hooks/useI18n';

const HANDLE_LABELS = {
  'text:prompt': 'prompt',
  'multiPrompt:in': 'shots',
  'omniParams:in': 'omni',
  'image:images': 'images',
  'image:end': 'END',
  'image:firstFrame': 'first',
  'image:lastFrame': 'last',
  'image:references': 'images',
  'video:references': 'videos',
  'audio:references': 'audios',
};

const OUTPUT_HANDLE_LABELS = {
  'video:out': 'video:out',
  'image:lastFrame': 'last',
};

const LEGACY_BRIDGE_INPUT_HANDLES = [
  // Temporary Phase 2 bridge handle. Kept only to avoid breaking current
  // in-session edges until Phase 3/4 moves node.data/project.json to the final
  // schema-driven structure.
  { id: 'multiPrompt:in', top: '32%' },
  // Temporary Phase 2 bridge handle. Remove after final stable image:firstFrame migration.
  { id: 'image:images', top: '50%' },
  // Temporary Phase 2 bridge handle. Remove after final stable image:lastFrame migration.
  { id: 'image:end', top: '50%' },
];
const LEGACY_BRIDGE_OUTPUT_HANDLES = [
  // Temporary Phase 2 bridge handle. Remove after Phase 3/4 finalizes output snapshots.
  { id: 'image:lastFrame', top: '50%' },
];

const TOOLBAR_PARAM_KEYS = ['videoMode', 'aspectRatio', 'duration', 'resolution', 'qualityMode', 'enableUpsample'];
const CORE_ADVANCED_PARAM_KEYS = ['generateAudio', 'seed'];
const VIDEO_NODE_MAX_WIDTH = 640;
const VIDEO_NODE_MAX_HEIGHT = 568;
const VIDEO_NODE_MIN_WIDTH = 320;
const VIDEO_NODE_MIN_HEIGHT = 240;

const isValidRatio = (ratio) => Number.isFinite(ratio) && ratio > 0;

const parseAspectRatio = (ratio) => {
  const [rawWidth, rawHeight] = String(ratio || '').split(':').map(Number);
  if (!Number.isFinite(rawWidth) || !Number.isFinite(rawHeight) || rawWidth <= 0 || rawHeight <= 0) {
    return null;
  }
  return rawWidth / rawHeight;
};

const getNodeSizeForRatio = (ratio) => {
  const safeRatio = isValidRatio(ratio) ? ratio : 16 / 9;

  if (Math.abs(safeRatio - 1) < 0.01) {
    return { width: 480, height: 480 };
  }

  if (safeRatio >= 1) {
    const width = VIDEO_NODE_MAX_WIDTH;
    const height = Math.max(VIDEO_NODE_MIN_HEIGHT, Math.round(width / safeRatio));
    return { width, height };
  }

  const height = VIDEO_NODE_MAX_HEIGHT;
  const width = Math.max(VIDEO_NODE_MIN_WIDTH, Math.round(height * safeRatio));
  return { width, height };
};

const getVideoModeDisplay = (value) =>
  VIDEO_MODE_OPTIONS.find((option) => option.id === value)?.shortLabel || value;

const getParamDisplay = (key, value, config) => {
  if (key === 'videoMode') return getVideoModeDisplay(value);
  if (key === 'generateAudio') return value ? 'Sound On' : 'Sound Off';
  if (config?.type === 'boolean') return value ? config.label : `No ${config.label}`;
  return value;
};

const resolveVideoUrl = (url) => {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('blob:')) return url;
  if (url.startsWith('/')) return `http://127.0.0.1:8000${url}`;
  return url;
};

const setNestedValue = (source, path = [], value) => {
  if (!path.length) return source;
  const next = { ...(source || {}) };
  let current = next;
  path.forEach((key, index) => {
    if (index === path.length - 1) {
      current[key] = value;
      return;
    }
    current[key] = { ...(current[key] || {}) };
    current = current[key];
  });
  return next;
};

const CAMERA_CONTROL_TYPES = [
  { id: 'none', label: 'Off' },
  { id: 'down_back', label: 'Down Back' },
  { id: 'forward_up', label: 'Forward Up' },
  { id: 'right_turn_forward', label: 'Right Turn Forward' },
  { id: 'left_turn_forward', label: 'Left Turn Forward' },
  { id: 'simple', label: 'Simple' },
];

const CAMERA_CONTROL_AXES = ['horizontal', 'vertical', 'pan', 'tilt', 'roll', 'zoom'];

const CapsuleDropdown = ({ id, activeMenu, label, minWidth = 84, onOpen, onSelect, options = [], value }) => {
  const open = activeMenu === id;
  const buttonClasses = open ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white';

  return (
    <div className="relative nodrag">
      <button
        type="button"
        onClick={() => onOpen(open ? null : id)}
        className={`rounded-full px-1.5 py-0.5 text-xs transition-colors ${buttonClasses}`}
      >
        <span>{label}</span>
      </button>

      {open && (
        <div
          className="nodrag nowheel animate-in fade-in zoom-in-95 absolute left-1/2 top-full z-[70] mt-3 -translate-x-1/2 rounded-[14px] border border-white/10 bg-[#141414]/95 shadow-2xl backdrop-blur-xl duration-150 overflow-hidden"
          style={{ minWidth }}
        >
          <div className="max-h-[212px] overflow-y-auto py-1 text-center w-full">
            {options.map((option) => {
              const optionValue = typeof option === 'string' ? option : option.id;
              const optionLabel = typeof option === 'string' ? option : option.label;
              const active = optionValue === value;

              return (
                <button
                  type="button"
                  key={optionValue}
                  onClick={() => onSelect(optionValue)}
                  className={`block w-full px-3 py-1.5 text-xs transition-colors ${
                    active ? 'bg-white/10 text-white' : 'text-white/50 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  {optionLabel}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

const getInputHandleTop = (index, total) => {
  if (total <= 1) return 50;
  if (total === 2) return index === 0 ? 36 : 56;
  const start = 30;
  const end = 72;
  return start + (index * (end - start)) / (total - 1);
};

export function VideoNode({ id, data }) {
  countRender('VideoNode');
  const { getEdges, getNodes, setNodes } = useReactFlow();
  const flowEdges = useEdges();
  const flowNodes = useNodes();
  const updateNodeInternals = useUpdateNodeInternals();
  const [activeMenu, setActiveMenu] = useState(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [cameraControlOpen, setCameraControlOpen] = useState(false);
  const [registry, setRegistry] = useState(null);
  const [videoMetadataRatioState, setVideoMetadataRatioState] = useState({ url: '', ratio: null });
  const [inputImageRatioState, setInputImageRatioState] = useState({ key: '', url: '', ratio: null });
  const [appSettings] = useAppSettings();
  const { t, language } = useI18n();
  const toolbarRef = useRef(null);
  const lastHandledRunRequestRef = useRef(data?.runRequestId);
  const lastAutoSizeSourceRef = useRef(null);

  const activeRegistry = registry || VIDEO_GENERATION_REGISTRY;
  const settings = useMemo(() => normalizeVideoGenerationSettings(data, registry), [data, registry]);
  const videoUrl = useMemo(() => resolveVideoUrl(settings.outputs?.videoUrl), [settings.outputs?.videoUrl]);
  const providerConfig = getVideoProvider(settings.provider, registry);
  const modelConfig = useMemo(
    () => getVideoModelConfig(settings.provider, settings.model, registry) || {},
    [registry, settings.provider, settings.model]
  );
  const selectedCapability = useMemo(
    () => getVideoCapability(activeRegistry.capabilities, settings.provider, settings.model, settings.videoMode),
    [activeRegistry.capabilities, settings.model, settings.provider, settings.videoMode]
  );
  const stableVideoHandles = useMemo(() => getStableVideoHandles(), []);
  const inputHandleStates = useMemo(
    () => stableVideoHandles.inputs.map((handleId) => getHandleState(selectedCapability, handleId)),
    [selectedCapability, stableVideoHandles.inputs]
  );
  const activeVideoHandleIds = useMemo(() => {
    try {
      const handles = getActiveVideoHandlesForMode(getEffectiveVideoMode(settings, modelConfig), modelConfig, settings);
      return Array.isArray(handles) && handles.length ? handles : ['text:prompt'];
    } catch (error) {
      console.warn('Failed to resolve active VideoNode handles; falling back to prompt only.', error);
      return ['text:prompt'];
    }
  }, [modelConfig, settings]);
  const activeVideoHandleIdsHash = useMemo(
    () => activeVideoHandleIds.join(','),
    [activeVideoHandleIds]
  );
  const visibleInputHandleStates = useMemo(
    () => inputHandleStates.filter((s) => s.supported && activeVideoHandleIds.includes(s.handleId)),
    [activeVideoHandleIds, inputHandleStates]
  );
  const hiddenInputHandleStates = useMemo(
    () => {
      const visibleHandleIds = new Set(visibleInputHandleStates.map((s) => s.handleId));
      return inputHandleStates.filter((s) => !visibleHandleIds.has(s.handleId));
    },
    [inputHandleStates, visibleInputHandleStates]
  );
  const inputHandleIdsHash = useMemo(() => {
    return inputHandleStates.map((s) => `${s.handleId}:${s.supported}`).join(',');
  }, [inputHandleStates]);
  const visibleInputHandleIdsHash = useMemo(() => {
    return visibleInputHandleStates.map((s) => s.handleId).join(',');
  }, [visibleInputHandleStates]);

  const outputHandleStates = useMemo(
    () => stableVideoHandles.outputs.map((handleId) => getHandleState(selectedCapability, handleId)),
    [selectedCapability, stableVideoHandles.outputs]
  );
  const isOmniModel = isKlingOmniModel(modelConfig) || isKlingOmniModel(settings);
  const isSeedance = isSeedanceModel(modelConfig) || isSeedanceModel(settings);
  const supportsCameraControl = Boolean(
    getParameterSchema(selectedCapability, 'cameraControl') ||
    modelConfig?.capabilities?.cameraControl?.supported
  );
  const hasEndImageEdge = flowEdges.some(
    (edge) => edge.target === id && ['image:end', 'image:lastFrame'].includes(edge.targetHandle ?? edge.targetHandleId)
  );
  const toolbarParamKeys = useMemo(() => {
    const quickParams = Array.isArray(modelConfig.quickParams) ? modelConfig.quickParams : [];
    const keys = quickParams.filter((key) =>
      TOOLBAR_PARAM_KEYS.includes(key) &&
      modelConfig.params?.[key] &&
      shouldRenderVideoToolbarParam(key, modelConfig, settings)
    );
    if (modelConfig.params?.qualityMode && !keys.includes('qualityMode')) keys.push('qualityMode');
    return keys;
  }, [modelConfig, settings]);
  const coreAdvancedParams = useMemo(() => (
    CORE_ADVANCED_PARAM_KEYS
      .map((key) => [key, getParameterSchema(selectedCapability, key) || modelConfig.params?.[key]])
      .filter(([, config]) => config && config.group !== 'hidden' && config.ui !== 'hidden')
  ), [modelConfig.params, selectedCapability]);

  const updateNodeData = useCallback((patch) => {
    setLastNodeDefaults('videoGeneration', patch);
    setNodes((nds) =>
      nds.map((node) =>
        node.id === id
          ? {
              ...node,
              data: {
                ...node.data,
                ...patch,
              },
            }
          : node
      )
    );
  }, [id, setNodes]);

  const refreshHandles = useCallback(() => {
    requestAnimationFrame(() => updateNodeInternals(id));
  }, [id, updateNodeInternals]);

  const buildSyncedParamsPatch = useCallback((nextSettings, nextModelConfig = modelConfig) => buildSyncedVideoParamsPatch({
    settings,
    nextSettings,
    modelConfig: nextModelConfig,
    fallbackParamKeys: [...TOOLBAR_PARAM_KEYS, ...CORE_ADVANCED_PARAM_KEYS, 'returnLastFrame'],
  }), [modelConfig, settings]);

  const applySettings = useCallback((patch) => {
    const draftSettings = buildSyncedParamsPatch({
      ...settings,
      ...patch,
    });
    const nextSettings = normalizeVideoGenerationSettings(draftSettings, registry);
    const nextModelConfig = getVideoModelConfig(nextSettings.provider, nextSettings.model, registry) || modelConfig;

    updateNodeData(buildSyncedParamsPatch(nextSettings, nextModelConfig));
    refreshHandles();
  }, [buildSyncedParamsPatch, modelConfig, refreshHandles, registry, settings, updateNodeData]);

  // 确保当输入端口支持状态发生变化时，刷新 React Flow handle internals
  useEffect(() => {
    refreshHandles();
  }, [activeVideoHandleIdsHash, inputHandleIdsHash, refreshHandles, selectedCapability, settings.model, settings.provider, settings.videoMode, visibleInputHandleIdsHash]);

  const handleProviderSelect = (providerId) => {
    const provider = getVideoProvider(providerId, registry);
    const nextModel = provider?.models?.[0]?.id;
    const nextModelConfig = getVideoModelConfig(providerId, nextModel, registry);
    applySettings(
      { provider: providerId, model: nextModel, customParams: { ...(nextModelConfig?.customParams || {}) } }
    );
    setActiveMenu(null);
  };

  const handleModelSelect = (modelId) => {
    const nextModelConfig = getVideoModelConfig(settings.provider, modelId, registry);
    applySettings({ model: modelId, customParams: { ...(nextModelConfig?.customParams || {}) } });
    setActiveMenu(null);
  };

  const handleAspectRatioChange = useCallback((nextRatio) => {
    const draftSettings = buildSyncedParamsPatch({
      ...settings,
      aspectRatio: nextRatio,
    });
    const nextSettings = normalizeVideoGenerationSettings(draftSettings, registry);

    updateNodeData(buildSyncedParamsPatch(nextSettings));
    refreshHandles();
  }, [buildSyncedParamsPatch, refreshHandles, registry, settings, updateNodeData]);

  const handleParamChange = (key, value) => {
    const config = modelConfig.params?.[key];
    if (config?.customParamPath) {
      applySettings({
        customParams: setNestedValue(settings.customParams, config.customParamPath, value),
      });
      setActiveMenu(null);
      return;
    }
    if (key === 'aspectRatio') {
      handleAspectRatioChange(value);
      setActiveMenu(null);
      return;
    }
    applySettings({ [key]: value });
    setActiveMenu(null);
  };

  const getHandleLabel = (handleId) => {
    return HANDLE_LABELS[handleId] || handleId;
  };

  const getHandleClasses = (state, side) => {
    const base =
      side === 'left'
        ? '!left-[-4px] !h-2 !w-2 !rounded-full !border transition-colors'
        : '!right-[-4px] !h-2 !w-2 !rounded-full !border transition-colors';
    if (state.status === 'unsupported') {
      return `${base} !border-white/10 !bg-[#0f0f0f] !opacity-30 grayscale`;
    }
    return `${base} !border-white/30 !bg-[#141414] group-hover:!border-white/45 group-hover:!bg-[#1a1a1a]`;
  };

  const handleMenuOpen = useCallback((menuId) => {
    setActiveMenu(menuId);
    if (menuId) setShowAdvanced(false);
  }, []);

  const handleCustomParamsChange = (event) => {
    try {
      const parsed = JSON.parse(event.target.value || '{}');
      updateNodeData({ customParams: parsed, customParamsText: undefined });
    } catch {
      updateNodeData({ customParamsText: event.target.value });
    }
  };

  const updateAdvancedParam = useCallback((key, value) => {
    updateNodeData({
      params: {
        ...(settings.params || {}),
        [key]: value,
      },
    });
  }, [settings.params, updateNodeData]);

  const updateKlingCameraControl = (patch) => {
    const currentCameraControl = settings.params?.cameraControl || settings.customParams?.kling?.cameraControl || {
      type: 'none',
      axis: 'pan',
      value: 0,
    };
    const nextCameraControl = {
      ...currentCameraControl,
      ...patch,
    };
    updateNodeData({
      params: {
        ...(settings.params || {}),
        cameraControl: nextCameraControl,
      },
      // Temporary provider-specific parameter UI. Phase 5 Provider Adapter /
      // dynamic params cleanup will isolate or remove this runtime bridge.
      customParams: {
        ...(settings.customParams || {}),
        kling: {
          ...(settings.customParams?.kling || {}),
          cameraControl: nextCameraControl,
        },
      },
    });
  };

  const { setTask, startTask, resumeTask } = useVideoTask({
    data: settings,
    updateNodeData,
  });

  const handleResumeQuery = useCallback((event) => {
    event.stopPropagation();
    setActiveMenu(null);
    setShowAdvanced(false);
    resumeTask(settings.task?.id);
  }, [resumeTask, settings.task?.id]);

  const collectVideoInputs = useCallback(() => {
    const allNodes = getNodes();
    const allEdges = getEdges();
    const nodeMap = new Map(allNodes.map((node) => [node.id, node]));

    if (isOmniModel) {
      const omniEdge = allEdges.find(
        (edge) => edge.target === id && (edge.targetHandle ?? edge.targetHandleId) === 'omniParams:in'
      );
      const omniParamsOutput = omniEdge
        ? getNodeOmniParamsOutput(nodeMap.get(omniEdge.source), allEdges, allNodes)
        : null;

      return {
        prompt: String(omniParamsOutput?.resolvedPrompt || omniParamsOutput?.prompt || '').trim(),
        images: [],
        endImage: null,
        multiPromptOutput: null,
        omniParamsOutput,
      };
    }

    const textEdges = allEdges.filter(
      (edge) => edge.target === id && (edge.targetHandle ?? edge.targetHandleId) === 'text:prompt'
    );
    const upstreamPrompt = textEdges
      .map((edge) => getNodeTextOutput(nodeMap.get(edge.source), allNodes, allEdges))
      .find((text) => String(text || '').trim());
    const prompt = String(upstreamPrompt || settings.prompt || '').trim();

    const multiPromptEdge = allEdges.find(
      (edge) => edge.target === id && (edge.targetHandle ?? edge.targetHandleId) === 'multiPrompt:in'
    );
    const multiPromptOutput = multiPromptEdge
      ? getNodeMultiPromptOutput(nodeMap.get(multiPromptEdge.source))
      : null;

    const sortByEdgeIndex = (items, key) =>
      items.sort((a, b) => {
        const aIndex = typeof a.edge.data?.[key] === 'number' ? a.edge.data[key] : a.order;
        const bIndex = typeof b.edge.data?.[key] === 'number' ? b.edge.data[key] : b.order;
        return aIndex - bIndex;
      });

    const collectFromHandle = (handleId, outputFn, indexKey = null) => {
      const matchingEdges = allEdges
        .filter((edge) => edge.target === id && (edge.targetHandle ?? edge.targetHandleId) === handleId)
        .map((edge, order) => ({ edge, order }));
      const orderedEdges = indexKey ? sortByEdgeIndex(matchingEdges, indexKey) : matchingEdges;
      return orderedEdges
        .flatMap(({ edge }) => outputFn(nodeMap.get(edge.source), edge.sourceHandle, edge, allNodes, allEdges))
        .filter(Boolean);
    };

    const collectImagesForHandle = (handleId, indexKey = null) =>
      collectFromHandle(handleId, getNodeImageOutput, indexKey);

    const collectVideosForHandle = (handleId, indexKey = null) =>
      collectFromHandle(handleId, getNodeVideoOutput, indexKey);

    const collectAudiosForHandle = (handleId, indexKey = null) =>
      collectFromHandle(handleId, getNodeAudioOutput, indexKey);

    if (isSeedance) {
      if (settings.videoMode === 'frame') {
        const firstFrame = collectImagesForHandle('image:firstFrame')[0] || null;
        const lastFrame = collectImagesForHandle('image:lastFrame')[0] || null;
        return {
          prompt,
          images: firstFrame ? [firstFrame] : [],
          endImage: lastFrame,
          multiPromptOutput,
          omniParamsOutput: null,
          seedanceParams: {
            mode: 'frame',
            firstFrame,
            ...(lastFrame ? { lastFrame } : {}),
            images: [],
            videos: [],
            audios: [],
          },
        };
      }

      return {
        prompt,
        images: [],
        endImage: null,
        multiPromptOutput,
        omniParamsOutput: null,
        seedanceParams: {
          mode: 'multimodal-reference',
          images: collectImagesForHandle('image:references', 'imageIndex'),
          videos: collectVideosForHandle('video:references', 'videoIndex'),
          audios: collectAudiosForHandle('audio:references', 'audioIndex'),
        },
      };
    }

    const collectLegacyImagesForHandle = (handleId) =>
      allEdges
        .filter((edge) => edge.target === id && (edge.targetHandle ?? edge.targetHandleId) === handleId)
        .flatMap((edge) => getNodeImageOutput(nodeMap.get(edge.source), edge.sourceHandle, edge, allNodes, allEdges))
        .filter(Boolean);

    const maxImages = Number(modelConfig.inputCapabilities?.maxImages) || Number.POSITIVE_INFINITY;
    const imageInputs = [
      ...collectLegacyImagesForHandle('image:firstFrame'),
      ...collectLegacyImagesForHandle('image:images'),
    ];
    const endImages = [
      ...collectLegacyImagesForHandle('image:lastFrame'),
      ...collectLegacyImagesForHandle('image:end'),
    ];

    let images = [];
    let endImage = null;
    if (settings.videoMode === 'image-to-video') {
      images = imageInputs.slice(0, 1);
      endImage = endImages[0] || null;
    } else if (settings.videoMode === 'reference-video') {
      images = imageInputs.slice(0, maxImages);
    }

    return {
      prompt,
      images,
      endImage,
      multiPromptOutput,
      omniParamsOutput: null,
    };
  }, [getEdges, getNodes, id, isOmniModel, isSeedance, modelConfig.inputCapabilities?.maxImages, settings.prompt, settings.videoMode]);

  const inputImageCandidates = useMemo(() => {
    const nodeMap = new Map(flowNodes.map((node) => [node.id, node]));
    const collectImagesForHandles = (handleIds) =>
      flowEdges
        .filter((edge) => edge.target === id && handleIds.includes(edge.targetHandle ?? edge.targetHandleId))
        .flatMap((edge) => getNodeImageOutput(nodeMap.get(edge.source), edge.sourceHandle, edge, flowNodes, flowEdges))
        .filter(Boolean)
        .map(resolveVideoUrl);

    const firstFrameImages = collectImagesForHandles(['image:images', 'image:in', 'image:firstFrame']);
    const endFrameImages = collectImagesForHandles(['image:end', 'END', 'image_tail', 'image:lastFrame']);
    return [...firstFrameImages, ...endFrameImages];
  }, [flowEdges, flowNodes, id]);
  const inputImageCandidatesKey = JSON.stringify(inputImageCandidates);

  const videoMetadataRatio = videoMetadataRatioState.url === videoUrl ? videoMetadataRatioState.ratio : null;
  const hasLoadedInputImage =
    inputImageRatioState.key === inputImageCandidatesKey &&
    inputImageRatioState.url &&
    inputImageCandidates.includes(inputImageRatioState.url);
  const inputImageRatio = hasLoadedInputImage ? inputImageRatioState.ratio : null;
  const inputImageUrl = isValidRatio(inputImageRatio) ? inputImageRatioState.url : inputImageCandidates[0] || '';

  const computedRatioInfo = useMemo(() => {
    if (isValidRatio(videoMetadataRatio)) {
      return { source: 'video', ratio: videoMetadataRatio };
    }
    if (isValidRatio(inputImageRatio)) {
      return { source: 'image', ratio: inputImageRatio };
    }
    const settingRatio = parseAspectRatio(settings.aspectRatio);
    if (isValidRatio(settingRatio)) {
      return { source: 'setting', ratio: settingRatio };
    }
    return { source: 'fallback', ratio: 16 / 9 };
  }, [inputImageRatio, settings.aspectRatio, videoMetadataRatio]);

  const computedRatio = computedRatioInfo.ratio;
  const computedRatioSource = computedRatioInfo.source;
  const ratioKey = Math.round(computedRatio * 1000) / 1000;
  const sourceKey = computedRatioSource === 'video'
    ? `video:${videoUrl}:${ratioKey}`
    : computedRatioSource === 'image'
      ? `image:${inputImageUrl}:${ratioKey}`
      : computedRatioSource === 'setting'
        ? `setting:${settings.aspectRatio}:${ratioKey}`
        : 'fallback:16:9';

  const handleRun = useCallback(async (event = { stopPropagation: () => {} }) => {
    event.stopPropagation();
    setActiveMenu(null);
    setShowAdvanced(false);

    const { prompt, images, endImage, multiPromptOutput, omniParamsOutput, seedanceParams } = collectVideoInputs();
    const runShotMode = supportsKlingMultiShot(modelConfig) ? getKlingShotMode(settings) : 'single';
    if (isOmniModel && !omniParamsOutput) {
      setTask({
        status: 'error',
        progress: 0,
        message: t('node.video.error.noOmni'),
      });
      return;
    }
    if (isOmniModel && !omniParamsOutput?.isValid) {
      setTask({
        status: 'error',
        progress: 0,
        message: omniParamsOutput?.errors?.[0] || t('node.video.error.omniInvalid'),
      });
      return;
    }
    if (runShotMode === 'customize' && !multiPromptOutput) {
      setTask({
        status: 'error',
        progress: 0,
        message: t('node.video.error.noShotList'),
      });
      return;
    }
    if (runShotMode === 'customize' && !multiPromptOutput?.isValid) {
      setTask({
        status: 'error',
        progress: 0,
        message: multiPromptOutput?.errors?.[0] || t('node.video.error.shotListInvalid'),
      });
      return;
    }
    if (!isOmniModel && !isSeedance && runShotMode !== 'customize' && !prompt) {
      setTask({
        status: 'error',
        progress: 0,
        message: t('node.video.error.noPrompt'),
      });
      return;
    }
    if (isSeedance && settings.videoMode === 'frame' && !seedanceParams?.firstFrame) {
      setTask({
        status: 'error',
        progress: 0,
        message: t('node.video.error.seedanceNoFrame'),
      });
      return;
    }
    if (
      isSeedance &&
      seedanceParams?.mode === 'multimodal-reference' &&
      seedanceParams.audios?.length > 0 &&
      !seedanceParams.images?.length &&
      !seedanceParams.videos?.length
    ) {
      setTask({
        status: 'error',
        progress: 0,
        message: t('node.video.error.seedanceNoRef'),
      });
      return;
    }

    const omniElements = resolveKlingOmniElements(omniParamsOutput);
    const klingParams = settings.customParams?.kling || {};
    const videoNodeKlingParams = {
      ...(klingParams.cfgScale !== undefined || settings.cfgScale !== undefined
        ? { cfgScale: klingParams.cfgScale ?? settings.cfgScale }
        : {}),
      ...(klingParams.cameraControl || settings.cameraControl
        ? { cameraControl: klingParams.cameraControl || settings.cameraControl }
        : {}),
    };

    const payload = {
      projectPath: settings.projectPath || window.currentProjectPath || undefined,
      provider: settings.provider,
      model: settings.model,
      videoMode: isOmniModel ? 'omni-video' : settings.videoMode,
      prompt: isOmniModel ? prompt : runShotMode === 'customize' ? '' : prompt,
      negativePrompt: settings.negativePrompt || '',
      aspectRatio: settings.aspectRatio,
      duration: isOmniModel && omniParamsOutput?.shotMode === 'customize' && omniParamsOutput?.durationSeconds
        ? `${omniParamsOutput.durationSeconds}s`
        : runShotMode === 'customize'
          ? `${multiPromptOutput.totalDuration}s`
          : settings.duration,
      durationSeconds: isOmniModel && omniParamsOutput?.shotMode === 'customize' && omniParamsOutput?.durationSeconds
        ? omniParamsOutput.durationSeconds
        : runShotMode === 'customize'
          ? multiPromptOutput.totalDuration
          : settings.durationSeconds,
      resolution: settings.resolution,
      qualityMode: settings.qualityMode,
      enableUpsample: settings.enableUpsample ?? false,
      generateAudio: settings.generateAudio ?? false,
      returnLastFrame: settings.returnLastFrame ?? false,
      publicAssetStorage: appSettings.publicAssetStorage || undefined,
      seed: settings.seed ?? -1,
      numberOfVideos: settings.numberOfVideos ?? 1,
      images: isOmniModel ? [] : images,
      endImage: isOmniModel ? null : endImage || null,
      customParams: isOmniModel
        ? {
            ...(settings.customParams || {}),
            kling: {
              omniParams: {
                ...omniParamsOutput,
                elements: omniElements,
              },
            },
          }
        : isSeedance
          ? {
              ...(settings.customParams || {}),
              seedance: seedanceParams,
            }
        : {
            ...(settings.customParams || {}),
            kling: {
              ...videoNodeKlingParams,
              ...(runShotMode === 'customize'
                ? {
                    shotMode: 'customize',
                    shotType: 'customize',
                    multiPrompt: multiPromptOutput.multiPrompt,
                  }
                : runShotMode === 'intelligence'
                  ? { shotMode: 'intelligence', shotType: 'intelligence' }
                  : { shotMode: 'single' }),
            },
          },
    };

    await startTask(payload);
  }, [
    collectVideoInputs,
    isOmniModel,
    isSeedance,
    appSettings.publicAssetStorage,
    modelConfig,
    setTask,
    settings,
    startTask,
    t,
  ]);

  useEffect(() => {
    let cancelled = false;
    fetchVideoGenerationRegistry()
      .then((nextRegistry) => {
        if (!cancelled) setRegistry(nextRegistry);
      })
      .catch((error) => {
        console.warn('Failed to fetch video specs; using local fallback.', error);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedCapability) return;
    const snapshot = buildVideoSchemaSnapshot(selectedCapability);
    if (
      data?.schemaSnapshot?.provider === snapshot?.provider &&
      data?.schemaSnapshot?.model === snapshot?.model &&
      data?.schemaSnapshot?.schemaVersion === snapshot?.schemaVersion
    ) {
      return;
    }
    updateNodeData({ schemaSnapshot: snapshot });
  }, [data?.schemaSnapshot, selectedCapability, updateNodeData]);

  useEffect(() => {
    let cancelled = false;
    let img = null;
    const candidates = JSON.parse(inputImageCandidatesKey);

    const loadImage = (index) => {
      const url = candidates[index];
      if (!url) return;

      img = new Image();
      img.onload = () => {
        if (cancelled) return;
        if (img.naturalWidth && img.naturalHeight) {
          setInputImageRatioState({
            key: inputImageCandidatesKey,
            url,
            ratio: img.naturalWidth / img.naturalHeight,
          });
        } else {
          loadImage(index + 1);
        }
      };
      img.onerror = () => {
        if (!cancelled) loadImage(index + 1);
      };
      img.src = url;
    };

    loadImage(0);

    return () => {
      cancelled = true;
      if (img) {
        img.onload = null;
        img.onerror = null;
      }
    };
  }, [inputImageCandidatesKey]);

  useEffect(() => {
    if (!isValidRatio(computedRatio) || lastAutoSizeSourceRef.current === sourceKey) return;

    lastAutoSizeSourceRef.current = sourceKey;
    const { width, height } = getNodeSizeForRatio(computedRatio);

    setNodes((nodes) =>
      nodes.map((node) =>
        node.id === id
          ? {
              ...node,
              width,
              height,
            }
          : node
      )
    );

    requestAnimationFrame(() => updateNodeInternals(id));
  }, [computedRatio, id, setNodes, sourceKey, updateNodeInternals]);

  useEffect(() => {
    if (!activeMenu) return undefined;

    const handlePointerDown = (event) => {
      if (toolbarRef.current?.contains(event.target)) return;
      setActiveMenu(null);
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setActiveMenu(null);
        setShowAdvanced(false);
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeMenu]);

  useEffect(() => {
    if (!showAdvanced) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setShowAdvanced(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showAdvanced]);

  useEffect(() => {
    if (!data?.runRequestId || lastHandledRunRequestRef.current === data.runRequestId) return;
    lastHandledRunRequestRef.current = data.runRequestId;
    handleRun();
  }, [data?.runRequestId, handleRun]);

  const renderPreview = () => {
    if (settings.outputs?.videoUrl) {
      return (
        <video
          controls
          src={videoUrl}
          onLoadedMetadata={(event) => {
            const width = event.currentTarget.videoWidth;
            const height = event.currentTarget.videoHeight;
            if (width && height) {
              setVideoMetadataRatioState({
                url: videoUrl,
                ratio: width / height,
              });
            }
          }}
          className="absolute inset-0 h-full w-full object-contain"
        />
      );
    }

    if (settings.task?.status === 'submitting') {
      return <div className="text-sm font-light text-white/35">{t('node.video.status.submitting')}</div>;
    }

    if (['running', 'processing'].includes(settings.task?.status)) {
      return (
        <div className="flex flex-col items-center gap-3 text-white/45">
          <div className="text-sm font-light">{t('node.video.status.generating')}</div>
          <div className="h-1 w-36 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-white/70 transition-all"
              style={{ width: `${settings.task.progress || 0}%` }}
            />
          </div>
          <div className="text-[11px] text-white/25">{settings.task.progress || 0}%</div>
        </div>
      );
    }

    if (['queued', 'pending', 'submitted'].includes(settings.task?.status)) {
      const queueText = settings.task.queuePosition
        ? t('node.video.status.queuedAt', { position: settings.task.queuePosition })
        : t('node.video.status.queued');
      return <div className="text-sm font-light text-white/35">{queueText}</div>;
    }

    if (isVideoTaskRecoverable(settings.task)) {
      const interruptedMessage = settings.task.message || t('node.video.status.queryInterrupted');
      return (
        <div className="flex flex-col items-center gap-3 px-6 text-center">
          <div
            className="line-clamp-3 text-sm font-light text-amber-200/80"
            title={interruptedMessage}
          >
            {t('node.video.status.queryInterrupted')}
          </div>
          <button
            type="button"
            onClick={handleResumeQuery}
            className="nodrag rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-xs text-white/70 transition-colors hover:border-white/25 hover:bg-white/15 hover:text-white"
          >
            {t('node.video.resumeQuery')}
          </button>
        </div>
      );
    }

    if (settings.task?.status === 'error') {
      const errorMessage = settings.task.message || settings.task.error || 'Video generation failed.';
      return (
        <div
          className="line-clamp-4 px-6 text-center text-sm font-light text-red-300/70"
          title={errorMessage}
        >
          {errorMessage}
        </div>
      );
    }

    if (settings.task?.status === 'success') {
      return (
        <div className="px-6 text-center text-sm font-light text-white/30">
          {settings.task.message || t('node.video.status.noVideoUrl')}
        </div>
      );
    }

    return <div className="text-sm font-light tracking-wide text-white/12">{t('node.video.status.noVideo')}</div>;
  };

  const modelOptions = providerConfig?.models || [];
  const showCustomParamsInput = shouldShowRawCustomParams(appSettings);
  const customParamsValue =
    typeof settings.customParamsText === 'string'
      ? settings.customParamsText
      : JSON.stringify(settings.customParams || {}, null, 2);
  const isTaskActive = isVideoTaskActive(settings.task?.status);
  const cameraControl = settings.params?.cameraControl || settings.customParams?.kling?.cameraControl || {
    type: 'none',
    axis: 'pan',
    value: 0,
  };
  const cameraControlType = cameraControl.type || 'none';
  const cameraControlAxis = cameraControl.axis || 'pan';
  const cameraControlValue = Number.isFinite(Number(cameraControl.value)) ? Number(cameraControl.value) : 0;

  return (
    <div className="canvas-node-card canvas-video-node-card group relative flex h-full w-full min-h-[180px] min-w-[260px] select-none flex-col overflow-visible rounded-[24px] border border-white/5 bg-[#181818] text-white transition-colors duration-100 hover:border-white/20">
      {showAdvanced && (
        <div
          className="nodrag nowheel absolute bottom-[calc(100%+4.25rem)] left-1/2 z-[60] flex max-h-[260px] w-[420px] -translate-x-1/2 flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#181818]/95 pl-4 pt-4 pb-4 pr-1.5 opacity-0 shadow-2xl backdrop-blur-xl transition-opacity duration-300 delay-[1000ms] group-hover:opacity-100 group-hover:delay-0"
          onMouseDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onWheel={(event) => event.stopPropagation()}
        >
          <div className="mb-2 flex shrink-0 items-center justify-between pr-2.5">
            <div className="text-[11px] font-light uppercase tracking-[0.18em] text-white/35">{t('node.video.advanced')}</div>
            <button
              type="button"
              onClick={() => setShowAdvanced(false)}
              className="nodrag nowheel rounded-full px-2 py-1 text-xs text-white/35 transition-colors hover:bg-white/5 hover:text-white"
            >
              Esc
            </button>
          </div>

          <div className="nowheel min-h-0 overflow-y-auto pr-2 mr-0.5">
            {coreAdvancedParams.length > 0 && (
              <div className="mb-2.5 grid grid-cols-2 gap-2.5">
                {coreAdvancedParams.map(([key, config]) => (
                  <label key={key} className="nodrag nowheel grid gap-1.5">
                    <span className="text-[10px] uppercase tracking-[0.14em] text-white/30">
                      {config.label || key}
                    </span>
                    <ParameterInput
                      name={key}
                      parameter={config}
                      value={settings[key] ?? settings.params?.[key]}
                      onChange={handleParamChange}
                    />
                  </label>
                ))}
              </div>
            )}

            <DynamicAdvancedParams
              capability={selectedCapability}
              params={settings.params || {}}
              onParamChange={updateAdvancedParam}
            />

            {supportsCameraControl && (
              <div className="nodrag nowheel mt-2.5 rounded-xl border border-white/10 bg-black/15">
                {/* TODO: Phase 2 - Move Kling camera-control ownership out of VideoNode. */}
                <button
                  type="button"
                  onClick={() => setCameraControlOpen((value) => !value)}
                  className="nodrag flex w-full items-center justify-between px-3 py-2 text-left text-[10px] uppercase tracking-[0.14em] text-white/35 transition-colors hover:bg-white/5 hover:text-white/55"
                >
                  <span>{t('node.video.cameraControl')}</span>
                  <span>{cameraControlOpen ? '-' : '+'}</span>
                </button>

                {cameraControlOpen && (
                  <div className="grid gap-2 border-t border-white/5 p-3">
                    {hasEndImageEdge && (
                      <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1.5 text-[11px] text-white/35">
                        {t('node.video.cameraControl.endFramePriority')}
                      </div>
                    )}

                    <label className="grid gap-1.5">
                      <span className="text-[10px] uppercase tracking-[0.14em] text-white/30">Type</span>
                      <CustomSelect
                        value={cameraControlType}
                        disabled={hasEndImageEdge}
                        onChange={(value) => updateKlingCameraControl({ type: value })}
                        options={CAMERA_CONTROL_TYPES}
                      />
                    </label>

                    {cameraControlType === 'simple' && (
                      <div className="grid gap-2">
                        <label className="grid gap-1.5">
                          <span className="text-[10px] uppercase tracking-[0.14em] text-white/30">Axis</span>
                          <CustomSelect
                            value={cameraControlAxis}
                            disabled={hasEndImageEdge}
                            onChange={(value) => updateKlingCameraControl({ axis: value })}
                            options={CAMERA_CONTROL_AXES}
                          />
                        </label>

                        <label className="grid gap-1.5">
                          <span className="text-[10px] uppercase tracking-[0.14em] text-white/30">Value</span>
                          <div className="flex items-center gap-2">
                            <input
                              type="range"
                              min={-10}
                              max={10}
                              step={0.5}
                              value={cameraControlValue}
                              disabled={hasEndImageEdge}
                              onChange={(event) => updateKlingCameraControl({ value: Number(event.target.value) })}
                              className="nodrag nowheel h-6 flex-1 accent-white disabled:opacity-45"
                            />
                            <span className="w-9 text-right text-[11px] text-white/45">
                              {cameraControlValue.toFixed(1)}
                            </span>
                          </div>
                        </label>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {showCustomParamsInput && (
              <label className="nodrag nowheel mt-2.5 grid gap-1.5">
                <span className="text-[10px] uppercase tracking-[0.14em] text-white/30">Custom Params</span>
                <div className="nodrag nowheel overflow-hidden rounded-xl border border-white/10 bg-black/25 transition-colors hover:border-white/20">
                  <textarea
                    value={customParamsValue}
                    onChange={handleCustomParamsChange}
                    spellCheck={false}
                    className="nodrag nowheel block h-20 w-full resize-none bg-transparent px-3 py-2 font-mono text-[11px] text-white/70 outline-none overflow-y-auto overflow-x-hidden"
                  />
                </div>
              </label>
            )}
          </div>
        </div>
      )}

      <div ref={toolbarRef} className="absolute -top-14 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full border border-white/5 bg-[#181818] px-4 py-2.5 text-sm font-light text-white/60 opacity-0 shadow-xl transition-opacity duration-300 delay-[1000ms] before:absolute before:left-0 before:top-full before:h-14 before:w-full before:content-[''] group-hover:pointer-events-auto group-hover:opacity-100 group-hover:delay-0">
        <button
          type="button"
          onClick={() => {
            setActiveMenu(null);
            setShowAdvanced((value) => !value);
          }}
          className={`nodrag flex h-5 w-5 items-center justify-center rounded-full text-xs transition-colors ${
            showAdvanced ? 'bg-white text-black' : 'text-white/45 hover:bg-white/5 hover:text-white'
          }`}
        >
          V
        </button>

        <div className="h-3 w-px bg-white/10" />

        <CapsuleDropdown
          id="provider"
          activeMenu={activeMenu}
          label={providerConfig?.label || settings.provider}
          minWidth={110}
          onOpen={handleMenuOpen}
          onSelect={handleProviderSelect}
          options={activeRegistry.providers}
          value={settings.provider}
        />

        <div className="h-3 w-px bg-white/10" />

        <CapsuleDropdown
          id="model"
          activeMenu={activeMenu}
          label={modelConfig.label || settings.model}
          minWidth={170}
          onOpen={handleMenuOpen}
          onSelect={handleModelSelect}
          options={modelOptions}
          value={settings.model}
        />

        {toolbarParamKeys.map((key) => {
          const config = modelConfig.params?.[key];
          const options =
            config?.type === 'boolean'
              ? [
                  { id: true, label: getParamDisplay(key, true, config) },
                  { id: false, label: getParamDisplay(key, false, config) },
                ]
              : config?.options?.map((option) => ({
                  id: option,
                  label: getParamDisplay(key, option, config),
                }));
          if (!options?.length) return null;

          return (
            <div key={key} className="contents">
              <div className="h-3 w-px bg-white/10" />
              <CapsuleDropdown
                id={`param:${key}`}
                activeMenu={activeMenu}
                label={getParamDisplay(key, settings[key] ?? config.default, config)}
                minWidth={key === 'videoMode' ? 128 : 82}
                onOpen={handleMenuOpen}
                onSelect={(value) => handleParamChange(key, value)}
                options={options}
                value={settings[key] ?? config.default}
              />
            </div>
          );
        })}

        <div className="h-3 w-px bg-white/10" />

        <button
          type="button"
          onClick={handleRun}
          disabled={isTaskActive}
          className={`nodrag flex h-5 w-5 items-center justify-center rounded-full transition-all ${
            isTaskActive
              ? 'bg-white text-black'
              : 'bg-[#222222] text-white/60 hover:bg-white hover:text-black'
          }`}
          title="Run Video Generator"
        >
          {isTaskActive ? (
            <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          ) : (
            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
            </svg>
          )}
        </button>
      </div>

      <div className="absolute left-4 top-4 z-20 flex items-center gap-2 rounded-full border border-white/5 bg-[#121212]/60 px-3 py-1.5 text-[11px] font-light text-white/50 backdrop-blur-md">
        <span
          className={`h-2 w-2 rounded-full ${selectedCapability ? 'bg-white/35' : 'bg-amber-300/60'}`}
          title={selectedCapability ? undefined : 'Capability schema missing; using conservative handle states.'}
        />
        <span>{t('node.video.label')}</span>
      </div>

      <div className="absolute inset-0 flex items-center justify-center overflow-hidden rounded-[24px]">
        {renderPreview()}
        <GenerationPreviewOverlay
          active={isTaskActive}
          hasExistingPreview={Boolean(videoUrl)}
          label={
            videoUrl
              ? (language === 'en-US' ? 'Regenerating video...' : '正在重新生成视频...')
              : (language === 'en-US' ? 'Generating video...' : '正在生成视频...')
          }
        />
      </div>

      {LEGACY_BRIDGE_INPUT_HANDLES.map((handle) => (
        <Handle
          key={handle.id}
          type="target"
          id={handle.id}
          position={Position.Left}
          className="!left-[-4px] !h-2 !w-2 !rounded-full !border-0 !bg-transparent !opacity-0"
          style={{ top: handle.top, pointerEvents: 'none' }}
        />
      ))}

      {visibleInputHandleStates.map((handleState, index) => (
        <div
          key={handleState.handleId}
          className="absolute left-0 z-20 flex items-center"
          style={{ top: `${getInputHandleTop(index, visibleInputHandleStates.length)}%` }}
          title={`${handleState.label} (${handleState.status})`}
        >
          <Handle
            type="target"
            id={handleState.handleId}
            position={Position.Left}
            className={getHandleClasses(handleState, 'left')}
          />
          <span
            className="pointer-events-none absolute left-4 whitespace-nowrap rounded bg-[#181818] px-1 text-[11px] font-light opacity-0 transition-opacity group-hover:opacity-100 text-white/40"
          >
            {getHandleLabel(handleState.handleId)}
          </span>
        </div>
      ))}

      {hiddenInputHandleStates.map((handleState) => (
        <Handle
          key={handleState.handleId}
          type="target"
          id={handleState.handleId}
          position={Position.Left}
          className="!left-[-4px] !h-2 !w-2 !rounded-full !border-0 !bg-transparent !opacity-0"
          style={{ top: '50%', pointerEvents: 'none' }}
        />
      ))}

      {outputHandleStates.map((handleState, index) => (
        <div
          key={handleState.handleId}
          className="absolute right-0 z-20 flex items-center"
          style={{ top: `${50 + (index - (outputHandleStates.length - 1) / 2) * 18}%` }}
          title={`${handleState.label} (${handleState.status})`}
        >
          <span className="pointer-events-none absolute right-4 whitespace-nowrap rounded bg-[#181818] px-1 text-[11px] font-light text-white/40 opacity-0 transition-opacity group-hover:opacity-100">
            {OUTPUT_HANDLE_LABELS[handleState.handleId] || handleState.handleId}
          </span>
          <Handle
            type="source"
            id={handleState.handleId}
            position={Position.Right}
            className={getHandleClasses(handleState, 'right')}
          />
        </div>
      ))}

      {LEGACY_BRIDGE_OUTPUT_HANDLES.map((handle) => (
        <Handle
          key={handle.id}
          type="source"
          id={handle.id}
          position={Position.Right}
          className="!right-[-4px] !h-2 !w-2 !rounded-full !border-0 !bg-transparent !opacity-0"
          style={{ top: handle.top, pointerEvents: 'none' }}
        />
      ))}

      <NodeResizeCorner minWidth={120} minHeight={90} />
    </div>
  );
}
