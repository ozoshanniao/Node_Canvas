import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Handle, Position, useEdges, useReactFlow, useUpdateNodeInternals } from '@xyflow/react';
import { NodeResizeCorner } from '../components/NodeResizeCorner';
import CustomSelect from '../components/CustomSelect';
import { setLastNodeDefaults } from '../utils/nodeDefaults';
import { getNodeImageOutput, getNodeMultiPromptOutput, getNodeOmniParamsOutput, getNodeTextOutput } from '../utils/nodeOutputs';
import { getImageNodeSizeByAspectRatio } from '../utils/nodeSizing';
import {
  VIDEO_GENERATION_REGISTRY,
  VIDEO_MODE_OPTIONS,
  getActiveVideoHandlesForMode,
  getKlingShotMode,
  getVideoModelConfig,
  getVideoProvider,
  isKlingOmniModel,
  normalizeVideoGenerationSettings,
  supportsKlingCameraControl,
  supportsKlingMultiShot,
} from '../utils/videoGenerationOptions';
import { countRender } from '../utils/perfDebug';

const HANDLE_LABELS = {
  'text:prompt': 'prompt',
  'multiPrompt:in': 'shots',
  'omniParams:in': 'omni',
  'image:images': 'images',
  'image:end': 'END',
};

const TOOLBAR_PARAM_KEYS = ['videoMode', 'aspectRatio', 'duration', 'resolution', 'qualityMode', 'enableUpsample'];
const ADVANCED_PARAM_KEYS = ['generateAudio', 'seed', 'shotMode', 'cfgScale'];

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

const getNestedValue = (source, path = []) =>
  path.reduce((current, key) => (current && typeof current === 'object' ? current[key] : undefined), source);

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

  return (
    <div className="relative nodrag">
      <button
        type="button"
        onClick={() => onOpen(open ? null : id)}
        className={`rounded-full px-1.5 py-0.5 text-xs transition-colors ${
          open ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white'
        }`}
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

export function VideoNode({ id, data }) {
  countRender('VideoNode');
  const { getEdges, getNodes, setNodes, setEdges } = useReactFlow();
  const flowEdges = useEdges();
  const updateNodeInternals = useUpdateNodeInternals();
  const [activeMenu, setActiveMenu] = useState(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [cameraControlOpen, setCameraControlOpen] = useState(false);
  const toolbarRef = useRef(null);
  const pollingTimerRef = useRef(null);
  const lastHandledRunRequestRef = useRef(data?.runRequestId);
  const lastHandleSignatureRef = useRef('');

  const settings = useMemo(() => normalizeVideoGenerationSettings(data), [data]);
  const providerConfig = getVideoProvider(settings.provider);
  const modelConfig = useMemo(
    () => getVideoModelConfig(settings.provider, settings.model) || {},
    [settings.provider, settings.model]
  );
  const isOmniModel = isKlingOmniModel(modelConfig) || isKlingOmniModel(settings);
  const activeInputHandles = getActiveVideoHandlesForMode(settings.videoMode, modelConfig, settings);
  const supportsCameraControl = supportsKlingCameraControl(modelConfig);
  const hasEndImageEdge = flowEdges.some(
    (edge) => edge.target === id && (edge.targetHandle ?? edge.targetHandleId) === 'image:end'
  );
  const toolbarParamKeys = useMemo(() => {
    const quickParams = Array.isArray(modelConfig.quickParams) ? modelConfig.quickParams : [];
    const keys = quickParams.filter((key) => TOOLBAR_PARAM_KEYS.includes(key) && modelConfig.params?.[key]);
    if (modelConfig.params?.qualityMode && !keys.includes('qualityMode')) keys.push('qualityMode');
    return keys;
  }, [modelConfig]);
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

  const pruneInvalidInputEdges = useCallback((nextSettings, nextModelConfig = modelConfig) => {
    const validHandles = new Set(
      getActiveVideoHandlesForMode(nextSettings.videoMode, nextModelConfig, nextSettings)
    );
    setEdges((eds) =>
      eds.filter((edge) => {
        if (edge.target !== id) return true;
        const targetHandle = edge.targetHandle ?? edge.targetHandleId;
        return validHandles.has(targetHandle);
      })
    );
  }, [id, modelConfig, setEdges]);

  const applySettings = useCallback((patch, options = {}) => {
    const nextSettings = normalizeVideoGenerationSettings({
      ...settings,
      ...patch,
    });
    const nextModelConfig = getVideoModelConfig(nextSettings.provider, nextSettings.model) || {};

    if (options.pruneModeEdges || nextSettings.videoMode !== settings.videoMode || nextSettings.qualityMode !== settings.qualityMode) {
      pruneInvalidInputEdges(nextSettings, nextModelConfig);
    }

    updateNodeData(nextSettings);
    refreshHandles();
  }, [pruneInvalidInputEdges, refreshHandles, settings, updateNodeData]);

  const handleProviderSelect = (providerId) => {
    const provider = getVideoProvider(providerId);
    const nextModel = provider?.models?.[0]?.id;
    const nextModelConfig = getVideoModelConfig(providerId, nextModel);
    applySettings(
      { provider: providerId, model: nextModel, customParams: { ...(nextModelConfig?.customParams || {}) } },
      { pruneModeEdges: true }
    );
    setActiveMenu(null);
  };

  const handleModelSelect = (modelId) => {
    const nextModelConfig = getVideoModelConfig(settings.provider, modelId);
    applySettings({ model: modelId, customParams: { ...(nextModelConfig?.customParams || {}) } }, { pruneModeEdges: true });
    setActiveMenu(null);
  };

  const handleAspectRatioChange = useCallback((nextRatio) => {
    const nextSettings = normalizeVideoGenerationSettings({
      ...settings,
      aspectRatio: nextRatio,
    });
    const { width, height } = getImageNodeSizeByAspectRatio(nextSettings.aspectRatio || '16:9');

    updateNodeData(nextSettings);
    setNodes((nds) =>
      nds.map((node) =>
        node.id === id
          ? {
              ...node,
              width,
              height,
            }
          : node
      )
    );
    refreshHandles();
  }, [id, refreshHandles, setNodes, settings, updateNodeData]);

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
    applySettings({ [key]: value }, { pruneModeEdges: key === 'videoMode' });
    setActiveMenu(null);
  };

  const getHandleLabel = (handleId) => {
    if (handleId === 'image:images' && settings.videoMode === 'image-to-video') return 'image';
    return HANDLE_LABELS[handleId] || handleId;
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

  const updateKlingCameraControl = (patch) => {
    const currentCameraControl = settings.customParams?.kling?.cameraControl || {
      type: 'none',
      axis: 'pan',
      value: 0,
    };
    updateNodeData({
      customParams: {
        ...(settings.customParams || {}),
        kling: {
          ...(settings.customParams?.kling || {}),
          cameraControl: {
            ...currentCameraControl,
            ...patch,
          },
        },
      },
    });
  };

  const handleAddElement = () => {
    const currentIds = settings.customParams?.kling?.elementIds || [""];
    if (currentIds.length >= 3) return;
    updateNodeData({
      customParams: {
        ...(settings.customParams || {}),
        kling: {
          ...(settings.customParams?.kling || {}),
          elementIds: [...currentIds, ""],
        },
      },
    });
  };

  const handleRemoveElement = (index) => {
    const currentIds = [...(settings.customParams?.kling?.elementIds || [""])];
    if (currentIds.length <= 1) {
      currentIds[0] = "";
    } else {
      currentIds.splice(index, 1);
    }
    updateNodeData({
      customParams: {
        ...(settings.customParams || {}),
        kling: {
          ...(settings.customParams?.kling || {}),
          elementIds: currentIds,
        },
      },
    });
  };

  const handleElementIdChange = (index, value) => {
    const currentIds = [...(settings.customParams?.kling?.elementIds || [""])];
    currentIds[index] = value;
    updateNodeData({
      customParams: {
        ...(settings.customParams || {}),
        kling: {
          ...(settings.customParams?.kling || {}),
          elementIds: currentIds,
        },
      },
    });
  };

  const setTask = useCallback((taskPatch) => {
    updateNodeData({
      task: {
        ...settings.task,
        ...taskPatch,
      },
    });
  }, [settings.task, updateNodeData]);

  const clearPollingTimer = useCallback(() => {
    if (pollingTimerRef.current) {
      window.clearInterval(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }
  }, []);

  const applyTaskResponse = useCallback((task) => {
    if (!task) return;
    updateNodeData({
      task: {
        ...settings.task,
        ...task,
        status: task.status || settings.task?.status || 'idle',
        progress: task.progress ?? settings.task?.progress ?? 0,
        message: task.message || task.error || '',
        queuePosition: task.queuePosition ?? settings.task?.queuePosition ?? 0,
      },
      outputs: {
        ...(settings.outputs || {}),
        ...(task.outputs || {}),
        videoUrl: task.outputs?.videoUrl || task.localVideoUrl || settings.outputs?.videoUrl || '',
      },
    });
  }, [settings.outputs, settings.task, updateNodeData]);

  const pollTask = useCallback(async (taskId) => {
    try {
      const projectPath = settings.projectPath || window.currentProjectPath || '';
      const query = projectPath ? `?projectPath=${encodeURIComponent(projectPath)}` : '';
      const response = await fetch(`http://127.0.0.1:8000/api/video/tasks/${encodeURIComponent(taskId)}${query}`);
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.detail || `Video task query failed: ${response.status}`);
      }

      const task = result.data;
      applyTaskResponse(task);
      if (task?.status === 'success' || task?.status === 'error' || task?.status === 'cancelled') {
        clearPollingTimer();
      }
    } catch (error) {
      clearPollingTimer();
      setTask({
        status: 'error',
        progress: 0,
        message: error instanceof Error ? error.message : 'Video task query failed.',
      });
    }
  }, [applyTaskResponse, clearPollingTimer, setTask, settings.projectPath]);

  const startPolling = useCallback((taskId) => {
    clearPollingTimer();
    pollTask(taskId);
    pollingTimerRef.current = window.setInterval(() => pollTask(taskId), 4000);
  }, [clearPollingTimer, pollTask]);

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

    const collectImagesForHandle = (handleId) =>
      allEdges
        .filter((edge) => edge.target === id && (edge.targetHandle ?? edge.targetHandleId) === handleId)
        .flatMap((edge) => getNodeImageOutput(nodeMap.get(edge.source), edge.sourceHandle, edge, allNodes, allEdges))
        .filter(Boolean);

    const maxImages = Number(modelConfig.inputCapabilities?.maxImages) || Number.POSITIVE_INFINITY;
    const imageInputs = collectImagesForHandle('image:images');
    const endImages = collectImagesForHandle('image:end');

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
  }, [getEdges, getNodes, id, isOmniModel, modelConfig.inputCapabilities?.maxImages, settings.prompt, settings.videoMode]);

  const handleRun = useCallback(async (event = { stopPropagation: () => {} }) => {
    event.stopPropagation();
    setActiveMenu(null);
    setShowAdvanced(false);
    clearPollingTimer();

    // 运行前强校验 ELEMENTS（仅 kling-v3 / kling-v3-omni）
    const showElements =
      !isOmniModel &&
      (settings.provider === 'kling' || settings.provider === 'yunwu-kling') &&
      (settings.model === 'kling-v3' || settings.model === 'kling-v3-omni');
    if (showElements) {
      const elementIds = settings.customParams?.kling?.elementIds || [""];
      const activeIds = elementIds
        .map((id) => String(id || "").trim())
        .filter(Boolean);

      // 非数字校验或超过 3 个
      const allDigits = activeIds.every((id) => /^\d+$/.test(id));
      if (!allDigits || activeIds.length > 3) {
        updateNodeData({
          task: {
            ...settings.task,
            status: 'error',
            progress: 0,
            message: 'Invalid Kling element ID.',
          },
        });
        return;
      }
    }

    const { prompt, images, endImage, multiPromptOutput, omniParamsOutput } = collectVideoInputs();
    const runShotMode = supportsKlingMultiShot(modelConfig) ? getKlingShotMode(settings) : 'single';
    if (isOmniModel && !omniParamsOutput) {
      updateNodeData({
        task: {
          ...settings.task,
          status: 'error',
          progress: 0,
          message: 'Omni Composer input is required for Kling V3 Omni.',
        },
      });
      return;
    }
    if (isOmniModel && !omniParamsOutput?.isValid) {
      updateNodeData({
        task: {
          ...settings.task,
          status: 'error',
          progress: 0,
          message: omniParamsOutput?.errors?.[0] || 'Omni Composer input is invalid.',
        },
      });
      return;
    }
    if (runShotMode === 'customize' && !multiPromptOutput) {
      updateNodeData({
        task: {
          ...settings.task,
          status: 'error',
          progress: 0,
          message: 'Multi-shot customize requires a ShotList input.',
        },
      });
      return;
    }
    if (runShotMode === 'customize' && !multiPromptOutput?.isValid) {
      updateNodeData({
        task: {
          ...settings.task,
          status: 'error',
          progress: 0,
          message: multiPromptOutput?.errors?.[0] || 'ShotList input is invalid.',
        },
      });
      return;
    }
    if (!isOmniModel && runShotMode !== 'customize' && !prompt) {
      updateNodeData({
        task: {
          ...settings.task,
          status: 'error',
          progress: 0,
          message: 'Prompt is required.',
        },
      });
      return;
    }

    updateNodeData({
      task: {
        ...settings.task,
        status: 'submitting',
        progress: 0,
        message: 'Submitting video task...',
        queuePosition: 0,
      },
      outputs: {
        ...(settings.outputs || {}),
        videoUrl: '',
      },
    });

    try {
      // 提取有效的经过 trim 的 elementIds 发送给后端
      const cleanElementIds = (settings.customParams?.kling?.elementIds || [""])
        .map((id) => String(id || "").trim())
        .filter(Boolean)
        .slice(0, 3);

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
        enableUpsample: settings.enableUpsample ?? false,
        generateAudio: settings.generateAudio ?? false,
        seed: settings.seed ?? -1,
        numberOfVideos: settings.numberOfVideos ?? 1,
        images: isOmniModel ? [] : images,
        endImage: isOmniModel ? null : endImage || null,
        customParams: isOmniModel
          ? {
              ...(settings.customParams || {}),
              kling: {
                omniParams: omniParamsOutput,
              },
            }
          : {
              ...(settings.customParams || {}),
              kling: {
                ...(settings.customParams?.kling || {}),
                elementIds: cleanElementIds,
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

      const response = await fetch('http://127.0.0.1:8000/api/video/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.detail || `Video task submit failed: ${response.status}`);
      }

      const task = result.data;
      applyTaskResponse(task);
      if (task?.id && !['success', 'error', 'cancelled'].includes(task.status)) {
        startPolling(task.id);
      }
    } catch (error) {
      clearPollingTimer();
      updateNodeData({
        task: {
          ...settings.task,
          status: 'error',
          progress: 0,
          message: error instanceof Error ? error.message : 'Video task submit failed.',
        },
      });
    }
  }, [
    applyTaskResponse,
    clearPollingTimer,
    collectVideoInputs,
    isOmniModel,
    modelConfig,
    settings,
    startPolling,
    updateNodeData,
  ]);

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

  useEffect(() => {
    const handleSignature = activeInputHandles.join('|');
    if (lastHandleSignatureRef.current === handleSignature) return;
    lastHandleSignatureRef.current = handleSignature;
    pruneInvalidInputEdges(settings, modelConfig);
    refreshHandles();
  }, [activeInputHandles, modelConfig, pruneInvalidInputEdges, refreshHandles, settings]);

  useEffect(
    () => () => {
      clearPollingTimer();
    },
    [clearPollingTimer]
  );

  const renderParamControl = (key, config) => {
    const customValue = config.customParamPath
      ? getNestedValue(settings.customParams, config.customParamPath) ?? settings[key]
      : undefined;
    const value = customValue ?? settings[key] ?? config.default;
    if (config.type === 'select') {
      return (
        <CustomSelect
          value={value}
          onChange={(nextVal) => handleParamChange(key, nextVal)}
          options={config.options || []}
        />
      );
    }

    if (config.type === 'boolean') {
      return (
        <button
          type="button"
          onClick={() => handleParamChange(key, !value)}
          className={`nodrag h-7 w-12 rounded-full border p-0.5 transition-colors ${
            value ? 'border-white/50 bg-white/80' : 'border-white/10 bg-black/25'
          }`}
        >
          <span
            className={`block h-5 w-5 rounded-full transition-transform ${
              value ? 'translate-x-5 bg-black' : 'translate-x-0 bg-white/35'
            }`}
          />
        </button>
      );
    }

    if (config.type === 'number') {
      if (config.control === 'slider') {
        const numberValue = Number(value);
        return (
          <div className="nodrag nowheel flex items-center gap-2">
            <input
              type="range"
              value={Number.isFinite(numberValue) ? numberValue : config.default}
              min={config.min}
              max={config.max}
              step={config.step || 0.05}
              onChange={(event) => handleParamChange(key, Number(event.target.value))}
              className="nodrag nowheel h-6 flex-1 accent-white"
            />
            <span className="w-9 text-right text-[11px] text-white/45">
              {(Number.isFinite(numberValue) ? numberValue : config.default).toFixed(2)}
            </span>
          </div>
        );
      }
      return (
        <input
          type="number"
          value={value}
          min={config.min}
          max={config.max}
          step={config.step || 1}
          onChange={(event) => handleParamChange(key, Number(event.target.value))}
          className="nodrag w-full rounded-lg border border-white/10 bg-black/25 px-2 py-1.5 text-xs text-white/80 outline-none transition-colors hover:border-white/20"
        />
      );
    }

    return null;
  };

  const renderPreview = () => {
    if (settings.outputs?.videoUrl) {
      return (
        <video
          controls
          src={resolveVideoUrl(settings.outputs.videoUrl)}
          className="absolute inset-0 h-full w-full object-contain"
        />
      );
    }

    if (settings.task?.status === 'submitting') {
      return <div className="text-sm font-light text-white/35">Submitting video task...</div>;
    }

    if (settings.task?.status === 'running') {
      return (
        <div className="flex flex-col items-center gap-3 text-white/45">
          <div className="text-sm font-light">Generating video...</div>
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

    if (settings.task?.status === 'queued') {
      const queueText = settings.task.queuePosition ? `Queued · #${settings.task.queuePosition}` : 'Queued...';
      return <div className="text-sm font-light text-white/35">{queueText}</div>;
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
          {settings.task.message || 'Video generation completed, but no video URL was returned.'}
        </div>
      );
    }

    return <div className="text-sm font-light tracking-wide text-white/12">Video output will appear here...</div>;
  };

  const modelOptions = providerConfig?.models || [];
  const advancedParams = useMemo(
    () =>
      ADVANCED_PARAM_KEYS
        .filter((key) => modelConfig.params?.[key])
        .map((key) => [key, modelConfig.params[key]]),
    [modelConfig.params]
  );
  const showElements =
    !isOmniModel &&
    (settings.provider === 'kling' || settings.provider === 'yunwu-kling') &&
    (settings.model === 'kling-v3' || settings.model === 'kling-v3-omni');
  const customParamsValue =
    typeof settings.customParamsText === 'string'
      ? settings.customParamsText
      : JSON.stringify(settings.customParams || {}, null, 2);
  const isTaskActive = ['submitting', 'queued', 'running'].includes(settings.task?.status);
  const cameraControl = settings.customParams?.kling?.cameraControl || {
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
          className="nodrag nowheel absolute -top-81 left-1/2 z-[60] flex max-h-[260px] w-[420px] -translate-x-1/2 flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#181818]/95 pl-4 pt-4 pb-4 pr-1.5 opacity-0 shadow-2xl backdrop-blur-xl transition-opacity duration-300 delay-[1000ms] group-hover:opacity-100 group-hover:delay-0"
          onMouseDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onWheel={(event) => event.stopPropagation()}
        >
          <div className="mb-2 flex shrink-0 items-center justify-between pr-2.5">
            <div className="text-[11px] font-light uppercase tracking-[0.18em] text-white/35">ADVANCED</div>
            <button
              type="button"
              onClick={() => setShowAdvanced(false)}
              className="nodrag nowheel rounded-full px-2 py-1 text-xs text-white/35 transition-colors hover:bg-white/5 hover:text-white"
            >
              Esc
            </button>
          </div>

          <div className="nowheel flex-1 overflow-y-auto pr-2 mr-0.5">
            <div className="grid grid-cols-2 gap-2.5">
              {advancedParams.map(([key, config]) => (
                <label key={key} className="nodrag nowheel grid gap-1.5">
                  <span className="text-[10px] uppercase tracking-[0.14em] text-white/30">{config.label || key}</span>
                  {renderParamControl(key, config)}
                </label>
              ))}
            </div>

            {supportsCameraControl && (
              <div className="nodrag nowheel mt-2.5 rounded-xl border border-white/10 bg-black/15">
                <button
                  type="button"
                  onClick={() => setCameraControlOpen((value) => !value)}
                  className="nodrag flex w-full items-center justify-between px-3 py-2 text-left text-[10px] uppercase tracking-[0.14em] text-white/35 transition-colors hover:bg-white/5 hover:text-white/55"
                >
                  <span>Camera Control</span>
                  <span>{cameraControlOpen ? '-' : '+'}</span>
                </button>

                {cameraControlOpen && (
                  <div className="grid gap-2 border-t border-white/5 p-3">
                    {hasEndImageEdge && (
                      <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1.5 text-[11px] text-white/35">
                        End frame has priority. Camera Control will not be sent.
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

            {showElements && (
              <div className="nodrag nowheel mt-2.5 grid gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-[0.14em] text-white/30">Elements</span>
                  {(settings.customParams?.kling?.elementIds || [""]).length < 3 && (
                    <button
                      type="button"
                      onClick={handleAddElement}
                      className="nodrag nowheel text-[10px] text-white/45 hover:text-white transition-colors"
                    >
                      + Add Element
                    </button>
                  )}
                </div>
                <div className="grid gap-1.5">
                  {(settings.customParams?.kling?.elementIds || [""]).map((elementId, idx) => (
                    <div key={idx} className="nodrag nowheel flex items-center gap-1.5">
                      <div className="nodrag nowheel flex-1 overflow-hidden rounded-xl border border-white/10 bg-black/25 transition-colors hover:border-white/20">
                        <input
                          type="text"
                          value={elementId}
                          onChange={(e) => handleElementIdChange(idx, e.target.value)}
                          className="nodrag nowheel block w-full bg-transparent px-3 py-1.5 text-xs text-white/70 outline-none"
                          placeholder="Element ID"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveElement(idx)}
                        className="nodrag nowheel flex h-7 w-7 items-center justify-center rounded-xl border border-white/5 bg-black/25 text-white/40 transition-colors hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400"
                        title="Remove Element"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-16v1a1 1 0 001 1h3m-10 0h3m0 0V4a1 1 0 011-1h4a1 1 0 011 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
                <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1.5 text-[10px] text-white/35 flex flex-col gap-0.5">
                  {(settings.customParams?.kling?.elementIds || [""])
                    .map((id, idx) => ({ id, idx }))
                    .filter((item) => String(item.id || "").trim())
                    .map((item, index) => (
                      <span key={item.idx}>• Use &lt;&lt;&lt;element_{index + 1}&gt;&gt;&gt; in prompt</span>
                    ))}
                  {((settings.customParams?.kling?.elementIds || [""]).filter((id) => String(id || "").trim()).length === 0) && (
                    <span>• Add element and use &lt;&lt;&lt;element_1&gt;&gt;&gt; in prompt</span>
                  )}
                </div>
              </div>
            )}

            <label className="nodrag nowheel mt-2.5 grid gap-1.5">
              <span className="text-[10px] uppercase tracking-[0.14em] text-white/30">Negative Prompt</span>
              <div className="nodrag nowheel overflow-hidden rounded-xl border border-white/10 bg-black/25 transition-colors hover:border-white/20">
                <textarea
                  value={settings.negativePrompt || ''}
                  onChange={(event) => updateNodeData({ negativePrompt: event.target.value })}
                  className="nodrag nowheel block h-20 w-full resize-none bg-transparent px-3 py-2 text-xs text-white/75 outline-none overflow-y-auto overflow-x-hidden"
                  placeholder="Optional negative prompt..."
                />
              </div>
            </label>

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
          options={VIDEO_GENERATION_REGISTRY.providers}
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
        <span className="h-2 w-2 rounded-full bg-white/35" />
        <span>Video Generation</span>
      </div>

      <div className="absolute inset-0 flex items-center justify-center overflow-hidden rounded-[24px]">
        {renderPreview()}
      </div>

      {activeInputHandles.map((handleId, index) => (
        <div
          key={handleId}
          className="absolute left-0 z-20 flex items-center"
          style={{ top: `${32 + index * 18}%` }}
        >
          <Handle
            type="target"
            id={handleId}
            position={Position.Left}
            className="!left-[-4px] !h-2 !w-2 !rounded-full !border !border-white/40 !bg-[#121212] transition-colors group-hover:!border-white"
          />
          <span className="pointer-events-none absolute left-4 whitespace-nowrap rounded bg-[#181818] px-1 text-[11px] font-light text-white/40 opacity-0 transition-opacity group-hover:opacity-100">
            {getHandleLabel(handleId)}
          </span>
        </div>
      ))}

      <div className="absolute right-0 top-1/2 z-20 flex -translate-y-1/2 items-center">
        <span className="pointer-events-none absolute right-4 whitespace-nowrap rounded bg-[#181818] px-1 text-[11px] font-light text-white/40 opacity-0 transition-opacity group-hover:opacity-100">
          video:out
        </span>
        <Handle
          type="source"
          id="video:out"
          position={Position.Right}
          className="!right-[-4px] !h-2 !w-2 !rounded-full !border !border-white/40 !bg-[#121212] shadow-[0_0_8px_rgba(255,255,255,0.2)] transition-colors group-hover:!border-white"
        />
      </div>

      <NodeResizeCorner minWidth={120} minHeight={90} keepAspectRatio />
    </div>
  );
}
