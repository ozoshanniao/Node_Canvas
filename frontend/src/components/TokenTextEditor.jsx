import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { parseAtTokenAtCursor } from '../utils/textVariables';
import {
  ZERO_WIDTH_CARET,
  editorPartsFromTextAndTokens,
  isValidTokenNameForType,
  normalizeEditorTokens,
  normalizeTokenValue,
  tokenNameToText,
} from '../utils/textEditorTokens';

const tokenClassName =
  'mx-0.5 inline-flex align-baseline rounded-md border border-sky-300/25 bg-sky-500/18 px-1.5 py-0 text-sky-100 shadow-[0_0_0_1px_rgba(125,211,252,0.05)]';

const isTokenElement = (node) =>
  node?.nodeType === Node.ELEMENT_NODE &&
  node.hasAttribute('data-token-type') &&
  node.hasAttribute('data-token-value');

let tokenIdCounter = 0;

const createTokenId = (tokenType, tokenName) => {
  tokenIdCounter += 1;
  return `${tokenType}:${tokenName}:${Date.now().toString(36)}:${tokenIdCounter}`;
};

const createTokenElement = (tokenName, tokenType, tokenId) => {
  const token = document.createElement('span');
  token.contentEditable = 'false';
  token.dataset.tokenType = tokenType;
  token.dataset.tokenValue = tokenName;
  token.dataset.tokenId = tokenId || createTokenId(tokenType, tokenName);
  token.className = tokenClassName;
  token.textContent = tokenNameToText(tokenName, tokenType);
  return token;
};

const serializeEditorState = (root) => {
  if (!root) return { text: '', tokens: [] };
  let output = '';
  const tokens = [];
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
      const type = node.dataset.tokenType || 'media';
      const value = normalizeTokenValue(node.dataset.tokenValue || '');
      const tokenText = tokenNameToText(value, type);
      const start = output.length;
      output += tokenText;
      tokens.push({
        id: node.dataset.tokenId || `${type}:${value}:${start}:${start + tokenText.length}`,
        type,
        value,
        start,
        end: start + tokenText.length,
      });
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
  if (output.endsWith('\n')) {
    output = output.slice(0, -1);
  }
  return {
    text: output,
    tokens: normalizeEditorTokens(output, tokens),
  };
};

const serializeEditorNode = (root) => serializeEditorState(root).text;

const setEditorContent = (root, text, tokens) => {
  if (!root) return;
  const parts = editorPartsFromTextAndTokens(text, tokens);
  const nodes = [];

  parts.forEach((part) => {
    if (part.type === 'token') {
      nodes.push(createTokenElement(part.value, part.tokenType || 'media', part.id));
      nodes.push(document.createTextNode(ZERO_WIDTH_CARET));
    } else {
      nodes.push(document.createTextNode(part.text || ''));
    }
  });

  root.replaceChildren(...nodes);
};

const setEditorPlainText = (root, text) => {
  if (!root) return;
  setEditorContent(root, text, []);
};

const plainLengthForNode = (node) => {
  if (node.nodeType === Node.TEXT_NODE) return node.nodeValue.replaceAll(ZERO_WIDTH_CARET, '').length;
  if (isTokenElement(node)) {
    return tokenNameToText(normalizeTokenValue(node.dataset.tokenValue || ''), node.dataset.tokenType || 'media').length;
  }
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

export function TokenTextEditor({
  value = '',
  onChange,
  tokens,
  onTokensChange,
  suggestions = [],
  tokenType = 'media',
  placeholder = '',
  className = '',
  editorClassName = '',
  menuClassName = '',
  getSuggestionLabel = (suggestion) => `@${suggestion.name}`,
  getSuggestionValue = (suggestion) => suggestion.name,
  filterSuggestion = (suggestion, query) =>
    String(getSuggestionValue(suggestion) ?? '').toLowerCase().startsWith(query),
}) {
  const [autocompleteVisible, setAutocompleteVisible] = useState(false);
  const [autocompleteQuery, setAutocompleteQuery] = useState('');
  const [autocompletePosition, setAutocompletePosition] = useState({ start: 0, end: 0 });
  const [autocompleteMenuPosition, setAutocompleteMenuPosition] = useState({ left: 0, top: 0 });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const editorRef = useRef(null);
  const queryRangeRef = useRef(null);
  const isComposingRef = useRef(false);
  const lastEditorTextRef = useRef('');
  const tracksTokenMetadata = Array.isArray(tokens) || typeof onTokensChange === 'function';
  const normalizedTokens = useMemo(() => normalizeEditorTokens(value, tokens), [tokens, value]);

  const filteredCandidates = useMemo(() => {
    if (!autocompleteQuery) return suggestions;
    const query = autocompleteQuery.toLowerCase();
    return suggestions.filter((suggestion) => filterSuggestion(suggestion, query));
  }, [autocompleteQuery, filterSuggestion, suggestions]);

  const emitChange = useCallback((nextText, nextTokens = []) => {
    lastEditorTextRef.current = nextText;
    onChange?.(nextText);
    onTokensChange?.(nextTokens);
  }, [onChange, onTokensChange]);

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
    const nextState = serializeEditorState(editor);
    emitChange(nextState.text, nextState.tokens);
    updateAutocompleteFromSelection(nextState.text);
  }, [emitChange, updateAutocompleteFromSelection]);

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

  const insertPlainTextAtSelection = (text) => {
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (!editorRef.current?.contains(range.startContainer)) return;
    range.deleteContents();
    const textNode = document.createTextNode(text);
    range.insertNode(textNode);
    range.setStartAfter(textNode);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    syncTextFromEditor();
  };

  const insertToken = (tokenName) => {
    const editor = editorRef.current;
    if (!editor || !isValidTokenNameForType(tokenName, tokenType)) return;

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

    const token = createTokenElement(tokenName, tokenType);
    const spacer = document.createTextNode(ZERO_WIDTH_CARET);
    range.insertNode(spacer);
    range.insertNode(token);
    range.setStartAfter(spacer);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    queryRangeRef.current = null;

    const nextState = serializeEditorState(editor);
    emitChange(nextState.text, nextState.tokens);
    setAutocompleteVisible(false);
  };

  const handleKeyDown = (event) => {
    if (autocompleteVisible && filteredCandidates.length > 0 && event.key === 'ArrowDown') {
      event.preventDefault();
      setSelectedIndex((previous) => (previous + 1) % filteredCandidates.length);
      return;
    }
    if (autocompleteVisible && filteredCandidates.length > 0 && event.key === 'ArrowUp') {
      event.preventDefault();
      setSelectedIndex((previous) => (previous - 1 + filteredCandidates.length) % filteredCandidates.length);
      return;
    }
    if (autocompleteVisible && filteredCandidates.length > 0 && (event.key === 'Enter' || event.key === 'Tab')) {
      event.preventDefault();
      insertToken(getSuggestionValue(filteredCandidates[selectedIndex]));
      return;
    }
    if (autocompleteVisible && event.key === 'Escape') {
      event.preventDefault();
      queryRangeRef.current = null;
      setAutocompleteVisible(false);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      insertPlainTextAtSelection('\n');
      return;
    }
    if (event.key === 'Backspace') {
      const token = tokenBeforeSelection();
      if (token) {
        event.preventDefault();
        removeTokenNode(token);
      }
      return;
    }
    if (event.key === 'Delete') {
      const token = tokenAfterSelection();
      if (token) {
        event.preventDefault();
        removeTokenNode(token);
      }
    }
  };

  const handleKeyUp = (event) => {
    if (['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(event.key)) return;
    updateAutocompleteFromSelection(serializeEditorNode(editorRef.current));
  };

  const handlePaste = (event) => {
    event.preventDefault();
    const pastedText = event.clipboardData?.getData('text/plain') || '';
    insertPlainTextAtSelection(pastedText);
  };

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || isComposingRef.current) return;
    const nextValue = String(value ?? '');
    const nextTokenSignature = tracksTokenMetadata ? JSON.stringify(normalizedTokens) : '';
    const currentState = serializeEditorState(editor);
    const currentTokenSignature = tracksTokenMetadata ? JSON.stringify(currentState.tokens) : '';
    if (currentState.text !== nextValue || (tracksTokenMetadata && currentTokenSignature !== nextTokenSignature)) {
      setEditorContent(editor, nextValue, normalizedTokens);
      lastEditorTextRef.current = nextValue;
      setAutocompleteVisible(false);
    }
  }, [normalizedTokens, tracksTokenMetadata, value]);

  useEffect(() => {
    if (!tracksTokenMetadata || !Array.isArray(tokens)) return;
    const tokenSignature = JSON.stringify(tokens);
    const normalizedSignature = JSON.stringify(normalizedTokens);
    if (tokenSignature !== normalizedSignature) {
      onTokensChange?.(normalizedTokens);
    }
  }, [normalizedTokens, onTokensChange, tokens, tracksTokenMetadata]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (!editor.hasChildNodes()) {
      setEditorContent(editor, value, normalizedTokens);
      lastEditorTextRef.current = String(value ?? '');
    }
  }, []);

  const autocompleteMenu =
    autocompleteVisible && filteredCandidates.length > 0 && typeof document !== 'undefined'
      ? createPortal(
          <div
            className={`nodrag nopan fixed overflow-hidden rounded-lg border border-white/15 bg-[#1a1a1a] shadow-2xl ${menuClassName}`}
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
              {filteredCandidates.slice(0, 6).map((candidate, index) => {
                const tokenName = getSuggestionValue(candidate);
                return (
                  <button
                    key={candidate.key || `${tokenType}:${tokenName}`}
                    type="button"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      insertToken(tokenName);
                    }}
                    className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition-colors ${
                      index === selectedIndex
                        ? 'bg-white/15 text-white'
                        : 'text-white/70 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <span className="font-medium">{getSuggestionLabel(candidate)}</span>
                    {candidate.preview && (
                      <span className="flex-1 truncate text-[9px] text-white/25">
                        {candidate.preview.slice(0, 25)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <div className={`relative min-h-0 max-h-full ${className}`}>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        data-placeholder={placeholder}
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
        className={`nodrag nowheel box-border h-full max-h-full min-h-full w-full overflow-y-auto overflow-x-hidden whitespace-pre-wrap break-words bg-transparent pr-4 pb-4 text-sm font-light leading-relaxed tracking-wide text-white/90 focus:outline-none empty:before:pointer-events-none empty:before:text-white/20 empty:before:content-[attr(data-placeholder)] ${editorClassName}`}
      />

      {autocompleteMenu}
    </div>
  );
}
