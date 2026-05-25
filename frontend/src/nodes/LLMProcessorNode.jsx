import { setLastNodeDefaults } from '../utils/nodeDefaults';
import {
  LLM_PROVIDERS,
  getLLMProviderLabel,
  getLLMModelsByProvider,
  getLLMModelLabel,
  getFirstLLMModelId,
  getLLMParametersByProvider,
  getDefaultLLMParameters,
  getLLMModelCapabilities,
  getActiveLLMInputHandles,
} from '../utils/llmModels';
import { useEffect, useRef, useState } from 'react';
import { Handle, Position, useReactFlow } from '@xyflow/react';
import { FullscreenTextModal } from '../components/FullscreenTextModal';
import { NodeFullscreenButton } from '../components/NodeFullscreenButton';
import { NodeResizeCorner } from '../components/NodeResizeCorner';
import { getNodeImageOutput, getNodeTextOutput } from '../utils/nodeOutputs';
import { countRender } from '../utils/perfDebug';

export function LLMProcessorNode({ id, data }) {
  countRender('LLMProcessorNode');
  const { setNodes, getNodes, getEdges } = useReactFlow();
  const lastHandledRunRequestRef = useRef(data?.runRequestId);
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);
  const [activeMenu, setActiveMenu] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const provider = data.provider || 'Yunwu';
  const availableModels = getLLMModelsByProvider(provider);
  const model = availableModels.some((item) => item.id === data.model)
    ? data.model
    : getFirstLLMModelId(provider);

  const providerParameters = getLLMParametersByProvider(provider);
  const defaultParameters = getDefaultLLMParameters(provider);

  const temperature = data.temperature ?? defaultParameters.temperature ?? 0.85;
  const maxTokens = data.maxTokens ?? defaultParameters.maxTokens ?? 65535;
  const thinkingLevel = data.thinkingLevel ?? defaultParameters.thinkingLevel;
  const thinking = data.thinking ?? defaultParameters.thinking ?? 'enabled';
  const reasoningEffort = data.reasoningEffort ?? defaultParameters.reasoningEffort ?? 'high';
  const hasThinkingLevel = Boolean(providerParameters.thinkingLevel?.enabled);
  const hasThinking = Boolean(providerParameters.thinking?.enabled);
  const hasReasoningEffort = Boolean(providerParameters.reasoningEffort?.enabled) && thinking !== 'disabled';
  const hasReasoningControls = hasThinkingLevel || hasThinking;

  const providerLabel = getLLMProviderLabel(provider);
  const modelLabel = getLLMModelLabel(provider, model);
  const modelCapabilities = getLLMModelCapabilities(provider, model);
  const activeInputHandles = getActiveLLMInputHandles(provider, model);

  const outputText = data.outputText ?? '';
  const status = data.status || 'idle';

  const updateNodeData = (nextData) => {
    setLastNodeDefaults('llmProcessor', nextData);
    
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === id) {
          return { ...node, data: { ...node.data, ...nextData } };
        }
        return node;
      })
    );
  };

  const toggleMenu = (menuName) => {
    setActiveMenu(activeMenu === menuName ? null : menuName);
  };

  const handleOutputChange = (e) => {
    updateNodeData({
      outputText: e.target.value,
      status: e.target.value ? 'edited' : 'idle',
    });
  };

  const handleCopy = async (e) => {
    e.stopPropagation();

    if (!outputText) return;

    try {
      await navigator.clipboard.writeText(outputText);
      updateNodeData({ copiedAt: Date.now() });
    } catch (error) {
      console.error('Failed to copy LLM output:', error);
    }
  };

  const handleRun = async (e = { stopPropagation: () => {} }) => {
    e.stopPropagation();

    if (isRunning) return;

    setIsRunning(true);
    updateNodeData({ status: 'running' });

    try {
      const allNodes = getNodes();
      const allEdges = getEdges();
      const nodeMap = new Map(allNodes.map((node) => [node.id, node]));

      const inputText = allEdges
        .filter(
          (edge) =>
            edge.target === id &&
            (edge.targetHandle ?? edge.targetHandleId) === 'text:in'
        )
        .map((edge) => getNodeTextOutput(nodeMap.get(edge.source), allNodes, allEdges))
        .filter((text) => String(text ?? '').trim())
        .join('\n');

      const imageInputEdges = allEdges.filter(
        (edge) =>
          edge.target === id &&
          (edge.targetHandle ?? edge.targetHandleId) === 'image:in'
      );
      const orderedImageUrls = imageInputEdges.flatMap((edge) => {
          const sourceNode = nodeMap.get(edge.source);
          return getNodeImageOutput(sourceNode, edge.sourceHandle, edge, allNodes, allEdges)
            .map((url) => (typeof url === 'string' ? url : url?.url || url?.src || url?.imageUrl))
            .filter(Boolean);
        });

      if (!modelCapabilities.supportsImages && imageInputEdges.length > 0) {
        updateNodeData({
          outputText: 'Current DeepSeek model does not support image input. Remove image connections or switch to a vision-capable model.',
          status: 'error',
          lastRunAt: new Date().toISOString(),
        });
        return;
      }

      const imageInputs = orderedImageUrls.map((url, index) => ({
        index,
        url,
      }));

      const payload = {
        provider,
        model,
        inputText,
        imageInputs,
        projectPath: data.projectPath || window.currentProjectPath || '',
        temperature,
        maxTokens,
        ...(hasThinking ? { thinking } : {}),
        ...(hasReasoningEffort ? { reasoningEffort } : {}),
        ...(thinkingLevel ? { thinkingLevel } : {}),
      };

      console.log('[LLMProcessor payload]', {
        provider,
        model,
        inputTextLength: inputText.length,
        imageInputsCount: imageInputs.length,
        imageInputs: imageInputs.map((item) => ({
          index: item.index,
          urlPrefix: item.url?.startsWith?.('data:image/')
            ? `${item.url.slice(0, 60)}...`
            : item.url?.slice(0, 120),
        })),
        temperature,
        maxTokens,
        ...(hasThinking ? { thinking } : {}),
        ...(hasReasoningEffort ? { reasoningEffort } : {}),
        ...(thinkingLevel ? { thinkingLevel } : {}),
      });

      if (!inputText.trim() && imageInputs.length === 0) {
        updateNodeData({
          outputText: 'No text or image input connected. Please connect text:in or image:in.',
          status: 'error',
          lastRunAt: new Date().toISOString(),
        });
        return;
      }

      const response = await fetch('http://127.0.0.1:8000/api/llm/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json();

      if (!response.ok || result.status !== 'success') {
        throw new Error(result.detail || result.message || 'LLM generation failed');
      }

      const resultText = result.data?.text ?? '';
      const lastRunAt = new Date().toISOString();
      const downstreamTextNodeIds = new Set(
        allEdges
          .filter(
            (edge) =>
              edge.source === id &&
              (edge.sourceHandle ?? edge.sourceHandleId) === 'text:out'
          )
          .map((edge) => edge.target)
          .filter((targetId) => nodeMap.get(targetId)?.type === 'textNode')
      );

      setNodes((nds) =>
        nds.map((node) => {
          if (node.id === id) {
            return {
              ...node,
              data: {
                ...node.data,
                outputText: resultText,
                status: 'success',
                lastRunAt,
              },
            };
          }

          if (downstreamTextNodeIds.has(node.id)) {
            return {
              ...node,
              data: {
                ...node.data,
                text: resultText,
              },
            };
          }

          return node;
        })
      );
    } catch (error) {
      console.error('LLM Processor run failed:', error);
      updateNodeData({
        status: 'error',
        outputText: error instanceof Error ? error.message : 'Unknown error',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setIsRunning(false);
    }
  };

  useEffect(() => {
    if (!data?.runRequestId || lastHandledRunRequestRef.current === data.runRequestId) return;
    lastHandledRunRequestRef.current = data.runRequestId;
    handleRun();
    // Existing run request bridge intentionally keys off runRequestId only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.runRequestId]);

  const handleProviderSelect = (nextProvider) => {
    const defaults = getDefaultLLMParameters(nextProvider);

    updateNodeData({
      provider: nextProvider,
      model: getFirstLLMModelId(nextProvider),
      ...defaults,
    });
    setActiveMenu(null);
  };

  const handleModelSelect = (nextModelId) => {
    updateNodeData({
      model: nextModelId,
    });
    setActiveMenu(null);
  };

  const charCount = outputText.length;

  const renderMenu = (name, items, currentValue, onSelect) => {
    if (activeMenu !== name) return null;

    return (
      <div className="absolute top-full left-1/2 -translate-x-1/2 mt-3.5 bg-[#141414] border border-white/5 rounded-[14px] py-1.5 shadow-2xl min-w-[140px] text-center animate-in fade-in zoom-in-95 duration-150 z-[70]">
        {items.map((item) => (
          <div
            key={item.id}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(item.id);
            }}
            className={`px-4 py-2 text-xs cursor-pointer transition-colors ${
              currentValue === item.id
                ? 'text-white bg-white/5 font-normal'
                : 'text-white/50 hover:text-white hover:bg-white/5'
            }`}
          >
            {item.label}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="relative w-full h-full min-w-[320px] min-h-[200px] group">
        {showAdvanced && (
        <div 
            className={`absolute ${
                hasReasoningControls ? '-top-72' : '-top-46'
            } left-1/2 -translate-x-1/2 bg-[#181818]/90 backdrop-blur-xl border border-white/5 rounded-2xl px-5 py-4 flex flex-col gap-4 shadow-2xl z-[60] nodrag opacity-0 group-hover:opacity-100 transition-opacity duration-300 delay-[1000ms] group-hover:delay-0`}
        >
            {providerParameters.thinking?.enabled && (
            <div className="flex flex-col gap-2 min-w-[220px]">
                <div className="flex justify-between text-[9px] text-white/30 uppercase tracking-tighter">
                <span>{providerParameters.thinking.label}</span>
                <span className="text-white/60">
                    {providerParameters.thinking.options.find((item) => item.id === thinking)?.label || thinking}
                </span>
                </div>

                <div className="grid grid-cols-2 gap-1">
                {providerParameters.thinking.options.map((item) => (
                    <button
                    key={item.id}
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        updateNodeData({
                          thinking: item.id,
                          ...(item.id === 'enabled' ? { reasoningEffort: reasoningEffort || 'high' } : {}),
                        });
                    }}
                    className={`rounded-lg px-2 py-1.5 text-[10px] transition-colors ${
                        thinking === item.id
                        ? 'bg-white text-black'
                        : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/70'
                    }`}
                    >
                    {item.label}
                    </button>
                ))}
                </div>
            </div>
            )}

            {providerParameters.reasoningEffort?.enabled && thinking !== 'disabled' && (
            <div className="flex flex-col gap-2 min-w-[220px]">
                <div className="flex justify-between text-[9px] text-white/30 uppercase tracking-tighter">
                <span>{providerParameters.reasoningEffort.label}</span>
                <span className="text-white/60">
                    {providerParameters.reasoningEffort.options.find((item) => item.id === reasoningEffort)?.label || reasoningEffort}
                </span>
                </div>

                <div className="grid grid-cols-2 gap-1">
                {providerParameters.reasoningEffort.options.map((item) => (
                    <button
                    key={item.id}
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        updateNodeData({ reasoningEffort: item.id });
                    }}
                    className={`rounded-lg px-2 py-1.5 text-[10px] transition-colors ${
                        reasoningEffort === item.id
                        ? 'bg-white text-black'
                        : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/70'
                    }`}
                    >
                    {item.label}
                    </button>
                ))}
                </div>
            </div>
            )}

            {providerParameters.thinkingLevel?.enabled && (
            <div className="flex flex-col gap-2 min-w-[220px]">
                <div className="flex justify-between text-[9px] text-white/30 uppercase tracking-tighter">
                <span>{providerParameters.thinkingLevel.label}</span>
                <span className="text-white/60">
                    {providerParameters.thinkingLevel.options.find((item) => item.id === thinkingLevel)?.label || thinkingLevel}
                </span>
                </div>

                <div className="grid grid-cols-3 gap-1">
                {providerParameters.thinkingLevel.options.map((item) => (
                    <button
                    key={item.id}
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        updateNodeData({ thinkingLevel: item.id });
                    }}
                    className={`rounded-lg px-2 py-1.5 text-[10px] transition-colors ${
                        thinkingLevel === item.id
                        ? 'bg-white text-black'
                        : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/70'
                    }`}
                    >
                    {item.label}
                    </button>
                ))}
                </div>
            </div>
            )}

            {providerParameters.temperature?.enabled && (
            <div className="flex flex-col gap-1 min-w-[220px]">
                <div className="flex justify-between text-[9px] text-white/30 uppercase tracking-tighter">
                <span>{providerParameters.temperature.label}</span>
                <span className="text-white/60">{temperature}</span>
                </div>
                <input
                type="range"
                min={providerParameters.temperature.min}
                max={providerParameters.temperature.max}
                step={providerParameters.temperature.step}
                value={temperature}
                onChange={(e) => updateNodeData({ temperature: Number(e.target.value) })}
                className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-white"
                />
            </div>
            )}

            {providerParameters.maxTokens?.enabled && (
            <div className="flex flex-col gap-1 min-w-[220px]">
                <div className="flex justify-between text-[9px] text-white/30 uppercase tracking-tighter">
                <span>{providerParameters.maxTokens.label}</span>
                <span className="text-white/60">{maxTokens}</span>
                </div>
                <input
                type="number"
                min={providerParameters.maxTokens.min}
                max={providerParameters.maxTokens.max}
                step={providerParameters.maxTokens.step}
                value={maxTokens}
                onChange={(e) => updateNodeData({ maxTokens: Number(e.target.value) })}
                className="w-full bg-[#101010] border border-white/10 rounded-lg px-3 py-2 text-[13px] text-white/70 focus:outline-none focus:border-white/25 accent-white [color-scheme:dark]"
                />
            </div>
            )}
        </div>
        )}

      {/* 椤堕儴鑳跺泭宸ュ叿鏍?*/}
      <div className="absolute -top-13 left-1/2 -translate-x-1/2 bg-[#181818] border border-white/5 rounded-full px-6 py-2.5 flex items-center gap-2 text-sm text-white/60 shadow-xl z-50 font-light whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity duration-300 delay-[1000ms] group-hover:delay-0 before:content-[''] before:absolute before:top-full before:left-0 before:w-full before:h-4">
        <span
          onClick={(e) => {
            e.stopPropagation();
            setShowAdvanced((value) => !value);
          }}
          className={`text-xs w-5 h-5 rounded-full flex items-center justify-center cursor-pointer transition-all nodrag ${
            showAdvanced ? 'bg-white text-black' : 'text-white/40 hover:bg-white/5 hover:text-white'
          }`}
        >
          T
        </span>

        <div className="w-[1px] h-3 bg-white/10" />

        <div className="relative nodrag">
          <div
            onClick={(e) => {
              e.stopPropagation();
              toggleMenu('provider');
            }}
            className={`cursor-pointer transition-colors flex items-center gap-1.5 ${
              activeMenu === 'provider' ? 'text-white' : 'hover:text-white'
            }`}
          >
            {providerLabel} <span className="text-[9px] opacity-30 transform scale-90">|</span>
          </div>
          {renderMenu('provider', LLM_PROVIDERS, provider, handleProviderSelect)}
        </div>

        <div className="relative nodrag">
          <div
            onClick={(e) => {
              e.stopPropagation();
              toggleMenu('model');
            }}
            className={`cursor-pointer transition-colors flex items-center gap-1.5 ${
              activeMenu === 'model' ? 'text-white' : 'hover:text-white'
            }`}
          >
             {modelLabel}
          </div>
           {renderMenu('model', availableModels, model, handleModelSelect)}
        </div>

        <div className="w-[1px] h-3 bg-white/10" />

        <button
          onClick={handleRun}
          disabled={isRunning}
          className={`w-5 h-5 rounded-full flex items-center justify-center transition-all nodrag ${
            isRunning
              ? 'bg-white text-black'
              : 'bg-[#222222] text-white/60 hover:bg-white hover:text-black'
          }`}
          title="Run LLM Processor"
        >
          {isRunning ? (
            <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          ) : (
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
            </svg>
          )}
        </button>
      </div>

      <div className="canvas-node-card bg-[#181818] rounded-[24px] px-4 pt-3 pb-4 w-full h-full min-w-[320px] min-h-[200px] flex flex-col text-white select-none relative border border-white/5 transition-colors duration-100 hover:border-white/20">
        <div className="flex items-center gap-2 mb-2 px-1">
          <div className="flex items-center gap-2 text-white/30 text-xs font-light">
            <svg className="w-3.5 h-3.5 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h10M4 18h7" />
            </svg>
            <span>LLM Processor</span>
          </div>

          <div className="ml-auto flex items-center gap-1.5 nodrag">
            <button
              type="button"
              onClick={handleCopy}
              disabled={!outputText}
              className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                outputText
                  ? 'bg-white/5 text-white/40 hover:text-white/80 hover:bg-white/10'
                  : 'bg-white/5 text-white/15 cursor-not-allowed'
              }`}
              title="Copy output"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M8 8h10v10H8z M6 16H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"
                />
              </svg>
            </button>

            <NodeFullscreenButton onClick={() => setIsFullscreenOpen(true)} />
          </div>
        </div>

        <div className="flex-1 relative">
          <textarea
            value={outputText}
            onChange={handleOutputChange}
            placeholder="LLM output will appear here..."
            className="nodrag nowheel w-full h-full bg-transparent text-white/90 placeholder-white/20 resize-none focus:outline-none text-sm font-light tracking-wide leading-relaxed pr-4 pb-4"
          />
        </div>

        <div className="pt-2 border-t border-white/5 text-[10px] text-white/25 font-light">
          {status === 'idle' && 'No output yet'}
          {status === 'running' && 'Running...'}
          {status === 'success' && `Done  ${charCount} chars out`}
          {status === 'edited' && `Edited  ${charCount} chars out`}
          {status === 'error' && 'Error'}
        </div>

        <div className="absolute left-0 top-[38%] z-20 flex items-center">
          <Handle
            type="target"
            id="text:in"
            position={Position.Left}
            className="!left-[-4px] !h-2 !w-2 !rounded-full !border !border-white/40 !bg-[#121212] transition-colors group-hover:!border-white"
          />
          <span className="pointer-events-none absolute left-4 whitespace-nowrap rounded bg-[#181818] px-1 text-[11px] font-light text-white/40 opacity-0 transition-opacity group-hover:opacity-100">
            text
          </span>
        </div>

        {activeInputHandles.includes('image:in') && (
          <div className="absolute left-0 top-[62%] z-20 flex items-center">
            <Handle
              type="target"
              id="image:in"
              position={Position.Left}
              className="!left-[-4px] !h-2 !w-2 !rounded-full !border !border-white/40 !bg-[#121212] transition-colors group-hover:!border-white"
            />
            <span className="pointer-events-none absolute left-4 whitespace-nowrap rounded bg-[#181818] px-1 text-[11px] font-light text-white/40 opacity-0 transition-opacity group-hover:opacity-100">
              image
            </span>
          </div>
        )}

        <div className="absolute right-0 top-1/2 z-20 flex -translate-y-1/2 items-center">
          <span className="pointer-events-none absolute right-4 whitespace-nowrap rounded bg-[#181818] px-1 text-[11px] font-light text-white/40 opacity-0 transition-opacity group-hover:opacity-100">
            text.out
          </span>
          <Handle
            type="source"
            id="text:out"
            position={Position.Right}
            className="!right-[-4px] !h-2 !w-2 !rounded-full !border !border-white/40 !bg-[#121212] transition-colors group-hover:!border-white"
          />
        </div>

        <NodeResizeCorner minWidth={320} minHeight={200} />

        <FullscreenTextModal
          open={isFullscreenOpen}
          title="LLM Processor"
          subtitle={`${providerLabel} 路 ${modelLabel}`}
          value={outputText}
          onChange={(nextText) =>
            updateNodeData({
              outputText: nextText,
              status: nextText ? 'edited' : 'idle',
            })
          }
          onClose={() => setIsFullscreenOpen(false)}
          mode="single"
          placeholder="LLM output will appear here..."
        />
      </div>
    </div>
  );
}
