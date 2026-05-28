import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Handle, Position, useEdges, useNodes, useReactFlow } from '@xyflow/react';
import { FullscreenTextModal } from '../components/FullscreenTextModal';
import { NodeFullscreenButton } from '../components/NodeFullscreenButton';
import { NodeResizeCorner } from '../components/NodeResizeCorner';
import { getNodeTextOutput } from '../utils/nodeOutputs';
import { getVariableKey, normalizeVariableName, getStaticMediaSuggestions, parseAtTokenAtCursor } from '../utils/textVariables';
import { ZERO_WIDTH_CARET, isMediaTokenName, mediaTokenToText } from '../utils/textEditorTokens';
import { countRender } from '../utils/perfDebug';

const tokenClassName =
  'mx-0.5 inline-flex align-baseline rounded-md border border-sky-300/25 bg-sky-500/18 px-1.5 py-0 text-sky-100 shadow-[0_0_0_1px_rgba(125,211,252,0.05)]';

const isTokenElement = (node) => node?.nodeType === Node.ELEMENT_NODE && node.hasAttribute('data-media-token');

const createMediaTokenElement = (tokenName) => {
  const token = document.createElement('span');
  token.contentEditable = 'false';
  token.dataset.mediaToken = tokenName;
  token.className = tokenClassName;
  token.textContent = mediaTokenToText(tokenName);
  return token;
};

const serializeEditorNode = (root) => {
  if (!root) return '';
  let output = '';
  const visit = (node, options = {}) => {
    if (node.nodeType === Node.TEXT_NODE) {
      output += node.nodeValue.replaceAll(ZERO_WIDTH_CARET, '');
      return;
    }
    if (node.nodeName === 'BR') {
      output += '\n';
      return;
    }
    if (isTokenElement(node)) {
      output += mediaTokenToText(node.dataset.mediaToken || '');
      return;
    }
    const isBlock = !options.isRoot && ['DIV', 'P'].includes(node.nodeName);
    const lengthBefore = output.length;
    node.childNodes.forEach((child) => visit(child));
    if (isBlock && output.length > lengthBefore && !output.endsWith('\n')) {
      output += '\n';
    }
  };
  root.childNodes.forEach((child) => visit(child, { isRoot: false }));
  if (output.endsWith('\n')) return output.slice(0, -1);
  return output;
};

const setEditorPlainText = (root, text) => {
  if (!root) return;
  root.replaceChildren(document.createTextNode(String(text ?? '')));
};

const plainLengthForNode = (node) => {
  if (node.nodeType === Node.TEXT_NODE) return node.nodeValue.replaceAll(ZERO_WIDTH_CARET, '').length;
  if (isTokenElement(node)) return mediaTokenToText(node.dataset.mediaToken || '').length;
  return Array.from(node.childNodes).reduce((total, child) => total + plainLengthForNode(child), 0);
};

const textNodeOffsetFromPlainOffset = (node, plainOffset) => {
  let plain = 0;
  for (let index = 0; index < node.nodeValue.length; index += 1) {
    if (node.nodeValue[index] === ZERO_WIDTH_CARET) continue;
    if (plain === plainOffset) return index;
    plain += 1;
  }
  return node.nodeValue.length;
};

const childIndex = (node) => Array.prototype.indexOf.call(node.parentNode.childNodes, node);

const findDomPositionForPlainOffset = (root, offset) => {
  const target = Math.max(0, Number(offset) || 0);
  let consumed = 0;
  let fallback = { node: root, offset: root.childNodes.length };

  const visit = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const length = plainLengthForNode(node);
      if (target <= consumed + length) {
        return { node, offset: textNodeOffsetFromPlainOffset(node, target - consumed) };
      }
      consumed += length;
      fallback = { node, offset: node.nodeValue.length };
      return null;
    }

    if (isTokenElement(node)) {
      const length = plainLengthForNode(node);
      if (target <= consumed) return { node: node.parentNode, offset: childIndex(node) };
      if (target <= consumed + length) return { node: node.parentNode, offset: childIndex(node) + 1 };
      consumed += length;
      fallback = { node: node.parentNode, offset: childIndex(node) + 1 };
      return null;
    }

    for (const child of node.childNodes) {
      const found = visit(child);
      if (found) return found;
    }
    return null;
  };

  return visit(root) || fallback;
};

const setPlainTextSelection = (root, start, end = start) => {
  const range = document.createRange();
  const startPosition = findDomPositionForPlainOffset(root, start);
  const endPosition = findDomPositionForPlainOffset(root, end);
  range.setStart(startPosition.node, startPosition.offset);
  range.setEnd(endPosition.node, endPosition.offset);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
};

const getPlainTextSelectionOffset = (root) => {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return 0;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer)) return 0;
  const prefix = range.cloneRange();
  prefix.selectNodeContents(root);
  prefix.setEnd(range.startContainer, range.startOffset);
  const holder = document.createElement('div');
  holder.appendChild(prefix.cloneContents());
  return serializeEditorNode(holder).length;
};

const getCaretRect = (root) => {
  const selection = window.getSelection();
  if (!selection?.rangeCount || !root.contains(selection.anchorNode)) return null;
  const range = selection.getRangeAt(0).cloneRange();
  const originalRange = range.cloneRange();
  range.collapse(true);
  let rect = range.getClientRects()[0];
  if (rect && (rect.width || rect.height)) return rect;

  const marker = document.createElement('span');
  marker.textContent = ZERO_WIDTH_CARET;
  range.insertNode(marker);
  rect = marker.getBoundingClientRect();
  marker.remove();
  selection.removeAllRanges();
  selection.addRange(originalRange);
  return rect;
};

const isRangeInside = (root, range) =>
  Boolean(range && root?.contains(range.startContainer) && root.contains(range.endContainer));

export const TextNode = memo(function TextNode({ id, data }) {
  countRender('TextNode');
  const { setNodes } = useReactFlow();
  const [isEditingVariable, setIsEditingVariable] = useState(false);
  const [draftVariableName, setDraftVariableName] = useState(data.variableName || '');
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);
  const [autocompleteVisible, setAutocompleteVisible] = useState(false);
  const [autocompleteQuery, setAutocompleteQuery] = useState('');
  const [autocompletePosition, setAutocompletePosition] = useState({ start: 0, end: 0 });
  const [autocompleteMenuPosition, setAutocompleteMenuPosition] = useState({ left: 0, top: 0 });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const editorWrapperRef = useRef(null);
  const editorRef = useRef(null);
  const queryRangeRef = useRef(null);
  const isComposingRef = useRef(false);
  const lastEditorTextRef = useRef('');

  const text = data.text ?? data.content ?? data.value ?? data.prompt ?? '';
  const autoReceiveText = Boolean(data.autoReceiveText);
  const variableName = normalizeVariableName(data.variableName);
  const variableKey = getVariableKey(variableName);

  const filteredCandidates = useMemo(() => {
    return getStaticMediaSuggestions(text, autocompleteQuery);
  }, [autocompleteQuery, text]);

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

  const updateAutocompleteFromSelection = useCallback((nextText) => {
    const editor = editorRef.current;
    if (!editor || isComposingRef.current) {
      setAutocompleteVisible(false);
      return;
    }

    const cursorPos = getPlainTextSelectionOffset(editor);
    const parsed = parseAtTokenAtCursor(nextText, cursorPos);
    if (!parsed) {
      queryRangeRef.current = null;
      setAutocompleteVisible(false);
      return;
    }

    const startPosition = findDomPositionForPlainOffset(editor, parsed.start);
    const endPosition = findDomPositionForPlainOffset(editor, parsed.end);
    const queryRange = document.createRange();
    queryRange.setStart(startPosition.node, startPosition.offset);
    queryRange.setEnd(endPosition.node, endPosition.offset);
    queryRangeRef.current = queryRange.cloneRange();

    const rect = getCaretRect(editor);
    setAutocompleteQuery(parsed.query);
    setAutocompletePosition({ start: parsed.start, end: parsed.end });
    setAutocompleteMenuPosition({
      left: Math.max(0, rect ? rect.left : 0),
      top: Math.max(0, rect ? rect.bottom + 6 : 24),
    });
    setAutocompleteVisible(true);
    setSelectedIndex(0);
  }, []);

  const syncTextFromEditor = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const nextText = serializeEditorNode(editor);
    lastEditorTextRef.current = nextText;
    updateNodeData({ text: nextText });
    updateAutocompleteFromSelection(nextText);
  }, [updateAutocompleteFromSelection]);

  const removeTokenNode = (token) => {
    if (!token?.parentNode) return false;
    const parent = token.parentNode;
    const index = childIndex(token);
    const next = token.nextSibling;
    const previous = token.previousSibling;
    if (next?.nodeType === Node.TEXT_NODE && next.nodeValue === ZERO_WIDTH_CARET) {
      next.remove();
    } else if (previous?.nodeType === Node.TEXT_NODE && previous.nodeValue === ZERO_WIDTH_CARET) {
      previous.remove();
    }
    token.remove();
    const range = document.createRange();
    range.setStart(parent, Math.min(index, parent.childNodes.length));
    range.collapse(true);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    syncTextFromEditor();
    return true;
  };

  const tokenBeforeSelection = () => {
    const selection = window.getSelection();
    if (!selection?.rangeCount || !selection.isCollapsed) return null;
    const range = selection.getRangeAt(0);
    const node = range.startContainer;
    const offset = range.startOffset;
    if (node.nodeType === Node.TEXT_NODE) {
      if (offset > 0 && node.nodeValue.slice(0, offset).endsWith(ZERO_WIDTH_CARET)) {
        return isTokenElement(node.previousSibling) ? node.previousSibling : null;
      }
      return offset === 0 && isTokenElement(node.previousSibling) ? node.previousSibling : null;
    }
    const previous = node.childNodes[offset - 1];
    if (isTokenElement(previous)) return previous;
    if (previous?.nodeType === Node.TEXT_NODE && previous.nodeValue === ZERO_WIDTH_CARET && isTokenElement(previous.previousSibling)) {
      return previous.previousSibling;
    }
    return null;
  };

  const tokenAfterSelection = () => {
    const selection = window.getSelection();
    if (!selection?.rangeCount || !selection.isCollapsed) return null;
    const range = selection.getRangeAt(0);
    const node = range.startContainer;
    const offset = range.startOffset;
    if (node.nodeType === Node.TEXT_NODE) {
      return offset === node.nodeValue.length && isTokenElement(node.nextSibling) ? node.nextSibling : null;
    }
    const next = node.childNodes[offset];
    if (isTokenElement(next)) return next;
    if (next?.nodeType === Node.TEXT_NODE && next.nodeValue === ZERO_WIDTH_CARET && isTokenElement(next.nextSibling)) {
      return next.nextSibling;
    }
    return null;
  };

  const handleKeyDown = (e) => {
    if (autocompleteVisible && filteredCandidates.length > 0 && e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % filteredCandidates.length);
      return;
    }
    if (autocompleteVisible && filteredCandidates.length > 0 && e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filteredCandidates.length) % filteredCandidates.length);
      return;
    }
    if (autocompleteVisible && filteredCandidates.length > 0 && (e.key === 'Enter' || e.key === 'Tab')) {
      e.preventDefault();
      insertVariable(filteredCandidates[selectedIndex].name);
      return;
    }
    if (autocompleteVisible && e.key === 'Escape') {
      e.preventDefault();
      queryRangeRef.current = null;
      setAutocompleteVisible(false);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      insertPlainTextAtSelection('\n');
      return;
    }
    if (e.key === 'Backspace') {
      const token = tokenBeforeSelection();
      if (token) {
        e.preventDefault();
        removeTokenNode(token);
      }
      return;
    }
    if (e.key === 'Delete') {
      const token = tokenAfterSelection();
      if (token) {
        e.preventDefault();
        removeTokenNode(token);
      }
    }
  };

  const handleKeyUp = (e) => {
    if (['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(e.key)) return;
    updateAutocompleteFromSelection(serializeEditorNode(editorRef.current));
  };

  const insertPlainTextAtSelection = (value) => {
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (!editorRef.current?.contains(range.startContainer)) return;
    range.deleteContents();
    const textNode = document.createTextNode(value);
    range.insertNode(textNode);
    range.setStartAfter(textNode);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    syncTextFromEditor();
  };

  const insertVariable = (variableName) => {
    const editor = editorRef.current;
    if (!editor || !isMediaTokenName(variableName)) return;

    editor.focus();
    const selection = window.getSelection();
    let range = queryRangeRef.current;
    if (!isRangeInside(editor, range)) {
      const startPosition = findDomPositionForPlainOffset(editor, autocompletePosition.start);
      const endPosition = findDomPositionForPlainOffset(editor, autocompletePosition.end);
      range = document.createRange();
      range.setStart(startPosition.node, startPosition.offset);
      range.setEnd(endPosition.node, endPosition.offset);
    }
    range.deleteContents();

    const token = createMediaTokenElement(variableName);
    const spacer = document.createTextNode(ZERO_WIDTH_CARET);
    range.insertNode(spacer);
    range.insertNode(token);
    range.setStartAfter(spacer);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    queryRangeRef.current = null;

    const nextText = serializeEditorNode(editor);
    lastEditorTextRef.current = nextText;
    updateNodeData({ text: nextText });
    setAutocompleteVisible(false);
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

  const cancelVariableNameEdit = () => {
    setDraftVariableName(variableName);
    setIsEditingVariable(false);
  };

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || isComposingRef.current) return;
    const currentText = serializeEditorNode(editor);
    if (currentText !== String(text ?? '') && lastEditorTextRef.current !== String(text ?? '')) {
      setEditorPlainText(editor, text);
      lastEditorTextRef.current = String(text ?? '');
      setAutocompleteVisible(false);
    }
  }, [text]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (!editor.hasChildNodes()) {
      setEditorPlainText(editor, text);
      lastEditorTextRef.current = String(text ?? '');
    }
  }, []);

  const handlePaste = (event) => {
    event.preventDefault();
    const pastedText = event.clipboardData?.getData('text/plain') || '';
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    range.deleteContents();
    const textNode = document.createTextNode(pastedText);
    range.insertNode(textNode);
    range.setStartAfter(textNode);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    syncTextFromEditor();
  };

  const autocompleteMenu =
    autocompleteVisible && filteredCandidates.length > 0 && typeof document !== 'undefined'
      ? createPortal(
          <div
            className="nodrag nopan fixed overflow-hidden rounded-lg border border-white/15 bg-[#1a1a1a] shadow-2xl"
            style={{
              left: `${autocompleteMenuPosition.left}px`,
              top: `${autocompleteMenuPosition.top}px`,
              zIndex: 9999,
              minWidth: '180px',
              maxWidth: '240px',
              maxHeight: '200px',
            }}
          >
            <div className="max-h-[200px] overflow-y-auto">
              {filteredCandidates.slice(0, 6).map((candidate, index) => (
                <button
                  key={candidate.key}
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    insertVariable(candidate.name);
                  }}
                  className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition-colors ${
                    index === selectedIndex
                      ? 'bg-white/15 text-white'
                      : 'text-white/70 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <span className="font-medium">@{candidate.name}</span>
                  {candidate.preview && (
                    <span className="flex-1 truncate text-[9px] text-white/25">
                      {candidate.preview.slice(0, 25)}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>,
          document.body
        )
      : null;

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

      <div ref={editorWrapperRef} className="relative flex-1 min-h-0 max-h-full">
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          data-placeholder="Type your prompt here..."
          onInput={syncTextFromEditor}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onCompositionStart={() => {
            isComposingRef.current = true;
            setAutocompleteVisible(false);
          }}
          onCompositionEnd={() => {
            isComposingRef.current = false;
            syncTextFromEditor();
          }}
          onClick={() => updateAutocompleteFromSelection(serializeEditorNode(editorRef.current))}
          onKeyUp={handleKeyUp}
          className="nodrag nowheel box-border h-full max-h-full min-h-full w-full overflow-y-auto overflow-x-hidden whitespace-pre-wrap break-words bg-transparent pr-4 pb-4 text-sm font-light leading-relaxed tracking-wide text-white/90 focus:outline-none empty:before:pointer-events-none empty:before:text-white/20 empty:before:content-[attr(data-placeholder)]"
        />

        {autocompleteMenu}
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
        onChange={(nextText) => updateNodeData({ text: nextText })}
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
          },
        };
      })
    );
  }, [currentText, id, incomingText, setNodes]);

  return null;
}
