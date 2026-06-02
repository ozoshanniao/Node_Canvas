import { memo, useEffect, useMemo, useState } from 'react';
import { Handle, Position, useEdges, useNodes, useReactFlow } from '@xyflow/react';
import { FullscreenTextModal } from '../components/FullscreenTextModal';
import { NodeFullscreenButton } from '../components/NodeFullscreenButton';
import { NodeResizeCorner } from '../components/NodeResizeCorner';
import { TokenTextEditor } from '../components/TokenTextEditor';
import { getNodeTextOutput } from '../utils/nodeOutputs';
import { getVariableKey, normalizeVariableName, getStaticMediaSuggestions } from '../utils/textVariables';
import { countRender } from '../utils/perfDebug';

export const TextNode = memo(function TextNode({ id, data }) {
  countRender('TextNode');
  const { setNodes } = useReactFlow();
  const [isEditingVariable, setIsEditingVariable] = useState(false);
  const [draftVariableName, setDraftVariableName] = useState(data.variableName || '');
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);

  const text = data.text ?? data.content ?? data.value ?? data.prompt ?? '';
  const textTokens = Array.isArray(data.textTokens) ? data.textTokens : undefined;
  const autoReceiveText = Boolean(data.autoReceiveText);
  const variableName = normalizeVariableName(data.variableName);
  const variableKey = getVariableKey(variableName);

  const mediaSuggestions = useMemo(() => getStaticMediaSuggestions(text, ''), [text]);

  const updateNodeData = (nextData) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === id) {
          return { ...node, data: { ...node.data, ...nextData } };
        }
        return node;
      })
    );
  };

  const commitVariableName = () => {
    const normalized = normalizeVariableName(draftVariableName);
    updateNodeData({
      text,
      variableName: normalized,
      isVariableEnabled: Boolean(normalized),
    });
    setDraftVariableName(normalized);
    setIsEditingVariable(false);
  };

  const updateTextTokens = (nextTokens) => {
    updateNodeData({ textTokens: nextTokens });
  };

  const cancelVariableNameEdit = () => {
    setDraftVariableName(variableName);
    setIsEditingVariable(false);
  };

  return (
    <div className="canvas-node-card bg-[#181818] rounded-[24px] px-4 pt-3 pb-4 w-full h-full min-w-[320px] min-h-[200px] flex flex-col text-white select-none group relative border border-white/5 transition-colors duration-100 hover:border-white/20">
      <div className="flex items-center gap-2 mb-2 px-1">
        <div className="flex items-center gap-2 text-white/30 text-xs font-light">
          <svg className="w-3.5 h-3.5 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h11" />
          </svg>
          <span>Text</span>
        </div>

        <div className="ml-auto flex items-center gap-1.5 nodrag">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              updateNodeData({ autoReceiveText: !autoReceiveText });
            }}
            className={`text-[9px] px-1.5 py-0.5 rounded-md font-light tracking-tighter transition-colors ${
              autoReceiveText ? 'bg-white/15 text-white/90' : 'bg-white/5 text-white/20 hover:text-white/50'
            }`}
            title="Auto receive text input"
          >
            Auto
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setDraftVariableName(variableName);
              setIsEditingVariable((value) => !value);
            }}
            className={`text-[9px] px-1.5 py-0.5 rounded-md font-light tracking-tighter transition-colors ${
              variableName ? 'bg-white/15 text-white/90' : 'bg-white/5 text-white/20 hover:text-white/50'
            }`}
          >
            {variableKey || '@'}
          </button>

          {isEditingVariable && (
            <input
              autoFocus
              value={draftVariableName}
              onChange={(e) => setDraftVariableName(e.target.value)}
              onBlur={commitVariableName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitVariableName();
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  cancelVariableNameEdit();
                }
              }}
              placeholder="name"
              className="w-20 bg-[#101010] border border-white/10 rounded-md px-2 py-0.5 text-[10px] text-white/80 placeholder-white/20 focus:outline-none focus:border-white/25"
            />
          )}

          <NodeFullscreenButton onClick={() => setIsFullscreenOpen(true)} />
        </div>
      </div>

      <TokenTextEditor
        value={text}
        onChange={(nextText) => updateNodeData({ text: nextText })}
        tokens={textTokens}
        onTokensChange={updateTextTokens}
        suggestions={mediaSuggestions}
        tokenType="media"
        placeholder="Type your prompt here..."
        className="flex-1"
      />

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

      {autoReceiveText && (
        <AutoReceiveTextBridge
          id={id}
          currentText={text}
          setNodes={setNodes}
        />
      )}

      <NodeResizeCorner minWidth={320} minHeight={200} />

      <FullscreenTextModal
        open={isFullscreenOpen}
        title="Text"
        subtitle={variableKey || undefined}
        value={text}
        onChange={(nextText) => updateNodeData({ text: nextText, textTokens: [] })}
        onClose={() => setIsFullscreenOpen(false)}
        mode="single"
        placeholder="Type your prompt here..."
      />
    </div>
  );
});

function AutoReceiveTextBridge({ id, currentText, setNodes }) {
  const nodes = useNodes();
  const edges = useEdges();

  const incomingText = useMemo(() => {
    const inputEdge = edges.find(
      (edge) => edge.target === id && (edge.targetHandle ?? edge.targetHandleId) === 'text:in'
    );

    if (!inputEdge || inputEdge.source === id) return '';

    const sourceNode = nodes.find((node) => node.id === inputEdge.source);
    return sourceNode ? getNodeTextOutput(sourceNode, nodes, edges) : '';
  }, [edges, id, nodes]);

  useEffect(() => {
    if (!incomingText) return;
    if (incomingText === currentText) return;

    setNodes((nds) =>
      nds.map((node) => {
        if (node.id !== id) return node;
        return {
          ...node,
          data: {
            ...node.data,
            text: incomingText,
            textTokens: [],
          },
        };
      })
    );
  }, [currentText, id, incomingText, setNodes]);

  return null;
}
