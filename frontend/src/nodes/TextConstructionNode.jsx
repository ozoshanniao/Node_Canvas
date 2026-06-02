import { memo, useEffect, useMemo, useState } from 'react';
import { Handle, Position, useEdges, useNodes, useReactFlow } from '@xyflow/react';
import { FullscreenTextModal } from '../components/FullscreenTextModal';
import { NodeFullscreenButton } from '../components/NodeFullscreenButton';
import { NodeResizeCorner } from '../components/NodeResizeCorner';
import { TokenTextEditor } from '../components/TokenTextEditor';
import { getTextConstructionOutput, getConnectedTextVariables, getMissingVariables } from '../utils/textVariables';
import { countRender, PERF_DEBUG } from '../utils/perfDebug';

export const TextConstructionNode = memo(function TextConstructionNode({ id, data }) {
  countRender('TextConstructionNode');
  const { setNodes } = useReactFlow();
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);
  const nodes = useNodes();
  const edges = useEdges();
  const template = data.template ?? data.text ?? '';
  const templateTokens = Array.isArray(data.templateTokens) ? data.templateTokens : undefined;
  // useMemo: 只有 template / nodes / edges 变化时才重新解析，避免每次 render 都同步执行
  const { resolvedText, variables } = useMemo(
    () => getTextConstructionOutput({ id, data: { ...data, template } }, nodes, edges),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, template, nodes, edges]
  );
  const variableKeys = Object.keys(variables);
  const previewPanelOpen = Boolean(data.previewPanelOpen);

  const availableVariables = useMemo(() => getConnectedTextVariables(nodes, edges, id), [edges, id, nodes]);
  const missingVariables = useMemo(() => getMissingVariables(template, variables), [template, variables]);

  useEffect(() => {
    if (!PERF_DEBUG) return;

    console.log('[TextConstruction resolve]', {
      nodeId: id,
      template,
      variableKeys,
      resolvedText,
    });
  }, [id, template, variableKeys.join('|'), resolvedText]);

  const updateTemplate = (nextTemplate) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === id) {
          return {
            ...node,
            data: {
              ...node.data,
              template: nextTemplate,
            },
          };
        }
        return node;
      })
    );
  };

  const updateTemplateTokens = (nextTokens) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === id) {
          return {
            ...node,
            data: {
              ...node.data,
              templateTokens: nextTokens,
            },
          };
        }
        return node;
      })
    );
  };

  const togglePreviewPanel = () => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === id) {
          return {
            ...node,
            data: {
              ...node.data,
              previewPanelOpen: !previewPanelOpen,
            },
          };
        }
        return node;
      })
    );
  };

  return (
    <div className="canvas-node-card bg-[#181818] rounded-[24px] px-4 pt-3 pb-4 w-full h-full min-w-[360px] max-w-[480px] min-h-[220px] flex flex-col text-white select-none group relative border border-white/5 transition-colors duration-100 hover:border-white/20">
      <div className="flex items-center gap-2 mb-2 px-1">
        <div className="flex items-center gap-2 text-white/30 text-xs font-light">
          <svg className="w-3.5 h-3.5 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h10M4 18h16" />
          </svg>
          <span>Text Construction</span>
        </div>

        <div className="ml-auto flex items-center gap-1.5 nodrag">
          <span className="bg-white/5 text-white/30 text-[9px] px-1.5 py-0.5 rounded-md font-light">
            @ build
          </span>

          <button
            type="button"
            title="Toggle resolved preview"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              togglePreviewPanel();
            }}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            className={`nodrag nopan w-6 h-6 rounded-md border flex items-center justify-center transition-colors ${
              previewPanelOpen
                ? 'bg-white/15 border-white/15 text-white/85'
                : 'bg-white/5 border-white/5 text-white/35 hover:text-white/80 hover:bg-white/10'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
            </svg>
          </button>

          <NodeFullscreenButton onClick={() => setIsFullscreenOpen(true)} />
        </div>
      </div>

      <TokenTextEditor
        value={template}
        onChange={updateTemplate}
        tokens={templateTokens}
        onTokensChange={updateTemplateTokens}
        suggestions={availableVariables}
        tokenType="text-var"
        placeholder="Use @A, @prompt, @scene_1..."
        className="flex-1"
        filterSuggestion={(suggestion, query) => suggestion.name.toLowerCase().includes(query)}
      />

      {availableVariables.length > 0 && (
        <div className="mt-2 flex shrink-0 items-center gap-1 overflow-hidden border-t border-white/5 pt-2 text-[10px] text-white/30">
          <span className="shrink-0 text-white/20">Available:</span>
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
            {availableVariables.slice(0, 4).map((variable) => (
              <span
                key={variable.key}
                className="shrink-0 rounded-md bg-white/5 px-1.5 py-0.5 text-white/45"
              >
                {variable.key}
              </span>
            ))}
            {availableVariables.length > 4 && (
              <span className="shrink-0 text-white/25">+{availableVariables.length - 4}</span>
            )}
          </div>
        </div>
      )}

      <div className="mt-2 border-t border-white/5 pt-2 text-[10px] text-white/30 font-light leading-relaxed flex items-center gap-3">
        <span className="text-white/20">Input:</span>
        <span>{template.length} chars</span>
        <span className="text-white/10">·</span>
        <span className="text-white/20">Resolved:</span>
        <span>{resolvedText.length} chars</span>
        {missingVariables.length > 0 && (
          <>
            <span className="text-white/10">·</span>
            <span className="text-amber-400/60">Missing: {missingVariables.length}</span>
          </>
        )}
      </div>

      <Handle
        type="target"
        id="text:in"
        position={Position.Left}
        className="!w-2 !h-2 !bg-[#121212] !border !border-white/40 !rounded-full !left-[-4px] group-hover:!border-white transition-all"
      />

      <Handle
        type="source"
        id="text:out"
        position={Position.Right}
        className="!w-2 !h-2 !bg-[#121212] !border !border-white/40 !rounded-full !right-[-4px] group-hover:!border-white transition-all"
      />

      <NodeResizeCorner minWidth={360} minHeight={220} />

      {previewPanelOpen && (
        <aside className="nodrag nopan absolute left-full top-0 ml-4 w-[320px] max-h-full rounded-[18px] bg-[#141414]/95 border border-white/10 shadow-2xl p-3 flex flex-col z-40">
          <div className="flex items-center justify-between gap-3 mb-2 shrink-0">
            <div className="text-[10px] uppercase tracking-wide text-white/35">Resolved</div>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                togglePreviewPanel();
              }}
              className="w-5 h-5 rounded-md bg-white/5 text-white/35 hover:text-white/80 hover:bg-white/10 flex items-center justify-center"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="nowheel overflow-y-auto pr-1 text-xs leading-relaxed text-white/70 whitespace-pre-wrap">
            {resolvedText || <span className="text-white/25">No resolved text</span>}
          </div>
        </aside>
      )}

      <FullscreenTextModal
        open={isFullscreenOpen}
        title="Text Construction"
        subtitle={variableKeys.length ? `Variables: ${variableKeys.map((key) => `@${key}`).join(', ')}` : 'No connected variables'}
        value={template}
        onChange={updateTemplate}
        onClose={() => setIsFullscreenOpen(false)}
        previewValue={resolvedText}
        previewTitle="Resolved Preview"
        mode="template-preview"
        placeholder="Use @A, @prompt, @scene_1..."
      />
    </div>
  );
});
