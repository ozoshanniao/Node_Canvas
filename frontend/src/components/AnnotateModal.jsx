import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ANNOTATION_HISTORY_LIMIT,
  createAnnotationId,
  createLocalEraserShape,
  eraseAnnotationObjectsAtPoint,
  exportAnnotatedImage,
  pushAnnotationHistory,
  renderAnnotationLayer,
} from '../utils/annotationUtils';
import { resolveImageUrl } from '../utils/resolveImageUrl';
import { uploadImageToInput } from '../utils/uploadToInput';

const COLORS = ['#ff3b30', '#ffcc00', '#007aff', '#34c759', '#ffffff', '#000000'];
const TOOLS = [
  { value: 'brush', label: 'Brush' },
  { value: 'rect', label: 'Rect' },
  { value: 'ellipse', label: 'Ellipse' },
  { value: 'eraser', label: 'Eraser' },
];

function ToolIcon({ tool }) {
  if (tool === 'brush') {
    return <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M4 20c2.5 0 4-1 4-3.5 0-1.1-.9-2-2-2S4 15.4 4 16.5V20zm3-6l8.8-8.8a2.12 2.12 0 013 3L10 17" />;
  }
  if (tool === 'rect') {
    return <rect x="5" y="6" width="14" height="12" rx="1" strokeWidth={1.7} />;
  }
  if (tool === 'ellipse') {
    return <ellipse cx="12" cy="12" rx="8" ry="6" strokeWidth={1.7} />;
  }
  return <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M4.5 15.5l7-9a2 2 0 012.8-.35l5.2 4a2 2 0 01.35 2.8L15.9 18H8.4l-3.55-2.75a.5.5 0 01-.35.25zM11 18h9" />;
}

const cloneAnnotations = (annotations) => (Array.isArray(annotations) ? annotations : []).map((shape) => ({
  ...shape,
  ...(shape.points ? { points: [...shape.points] } : {}),
}));

export function AnnotateModal({
  open,
  ...props
}) {
  if (!open) return null;
  return <AnnotateModalContent {...props} />;
}

function AnnotateModalContent({
  imageUrl,
  projectPath,
  initialAnnotations = [],
  initialColor = '#ff3b30',
  initialBrushSize = 12,
  initialEraserMode = 'local',
  initialEraserSize = 24,
  sourceChanged = false,
  onCancel,
  onSave,
}) {
  const canvasRef = useRef(null);
  const annotationCanvasRef = useRef(null);
  const imageRef = useRef(null);
  const drawingRef = useRef(null);
  const [tool, setTool] = useState('brush');
  const [color, setColor] = useState(initialColor || '#ff3b30');
  const [brushSize, setBrushSize] = useState(Number(initialBrushSize) || 12);
  const [eraserMode, setEraserMode] = useState(initialEraserMode === 'object' ? 'object' : 'local');
  const [eraserSize, setEraserSize] = useState(Number(initialEraserSize) || 24);
  const [cursorPreview, setCursorPreview] = useState(null);
  const [annotations, setAnnotations] = useState(() => cloneAnnotations(initialAnnotations));
  const [history, setHistory] = useState(() => [cloneAnnotations(initialAnnotations)]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const initialSnapshot = useMemo(
    () => JSON.stringify(cloneAnnotations(initialAnnotations)),
    [initialAnnotations]
  );

  const resolvedImageUrl = useMemo(
    () => resolveImageUrl(imageUrl, projectPath),
    [imageUrl, projectPath]
  );
  const isDirty = JSON.stringify(annotations) !== initialSnapshot;
  const activeSize = tool === 'eraser' ? eraserSize : brushSize;

  const redraw = useCallback((draftShape = null) => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image || !imageSize.width || !imageSize.height) return;
    const ctx = canvas.getContext('2d');
    let annotationCanvas = annotationCanvasRef.current;
    if (!annotationCanvas) {
      annotationCanvas = document.createElement('canvas');
      annotationCanvasRef.current = annotationCanvas;
    }
    if (annotationCanvas.width !== canvas.width || annotationCanvas.height !== canvas.height) {
      annotationCanvas.width = canvas.width;
      annotationCanvas.height = canvas.height;
    }
    const annotationCtx = annotationCanvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    renderAnnotationLayer(annotationCtx, annotations, draftShape);
    ctx.drawImage(annotationCanvas, 0, 0);
  }, [annotations, imageSize.height, imageSize.width]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  const commitAnnotations = useCallback((nextAnnotations) => {
    const snapshot = cloneAnnotations(nextAnnotations);
    const nextHistory = pushAnnotationHistory(
      history,
      historyIndex,
      snapshot,
      ANNOTATION_HISTORY_LIMIT
    );
    setAnnotations(snapshot);
    setHistory(nextHistory.history);
    setHistoryIndex(nextHistory.historyIndex);
  }, [history, historyIndex]);

  const undo = useCallback(() => {
    if (historyIndex <= 0) return;
    const nextIndex = historyIndex - 1;
    setHistoryIndex(nextIndex);
    setAnnotations(cloneAnnotations(history[nextIndex]));
  }, [history, historyIndex]);

  const redo = useCallback(() => {
    if (historyIndex >= history.length - 1) return;
    const nextIndex = historyIndex + 1;
    setHistoryIndex(nextIndex);
    setAnnotations(cloneAnnotations(history[nextIndex]));
  }, [history, historyIndex]);

  const requestCancel = useCallback(() => {
    if (isDirty && !window.confirm('Discard unsaved annotations?')) return;
    onCancel();
  }, [isDirty, onCancel]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      event.stopPropagation();
      if (event.key === 'Escape') requestCancel();
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [redo, requestCancel, undo]);

  const getPoint = (event) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(canvas.width, ((event.clientX - rect.left) / rect.width) * canvas.width)),
      y: Math.max(0, Math.min(canvas.height, ((event.clientY - rect.top) / rect.height) * canvas.height)),
    };
  };

  const updateCursorPreview = (event) => {
    if (tool !== 'brush' && tool !== 'eraser') {
      setCursorPreview(null);
      return;
    }
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const displayScale = rect.width / canvas.width;
    setCursorPreview({
      x: event.clientX,
      y: event.clientY,
      diameter: Math.max(2, activeSize * displayScale),
    });
  };

  const handlePointerDown = (event) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = getPoint(event);
    if (tool === 'eraser') {
      if (eraserMode === 'local') {
        drawingRef.current = createLocalEraserShape([point.x, point.y], eraserSize);
        redraw(drawingRef.current);
        return;
      }
      const originalAnnotations = cloneAnnotations(annotations);
      const remainingAnnotations = eraseAnnotationObjectsAtPoint(annotations, point, eraserSize);
      drawingRef.current = {
        type: 'objectEraser',
        originalAnnotations,
        remainingAnnotations,
      };
      if (remainingAnnotations.length !== annotations.length) {
        setAnnotations(cloneAnnotations(remainingAnnotations));
      }
      return;
    }
    drawingRef.current = tool === 'brush'
      ? { id: createAnnotationId(), type: 'brush', points: [point.x, point.y], color, strokeWidth: brushSize }
      : { id: createAnnotationId(), type: tool, x: point.x, y: point.y, width: 0, height: 0, color, strokeWidth: brushSize };
    redraw(drawingRef.current);
  };

  const handlePointerMove = (event) => {
    updateCursorPreview(event);
    if (!drawingRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    const point = getPoint(event);
    const draft = drawingRef.current;
    if (draft.type === 'objectEraser') {
      const remainingAnnotations = eraseAnnotationObjectsAtPoint(
        draft.remainingAnnotations,
        point,
        eraserSize
      );
      if (remainingAnnotations.length !== draft.remainingAnnotations.length) {
        draft.remainingAnnotations = remainingAnnotations;
        setAnnotations(cloneAnnotations(remainingAnnotations));
      }
      return;
    }
    if (draft.type === 'brush' || draft.type === 'eraser') {
      draft.points = [...draft.points, point.x, point.y];
    } else {
      draft.width = point.x - draft.x;
      draft.height = point.y - draft.y;
    }
    redraw(draft);
  };

  const handlePointerUp = (event) => {
    if (!drawingRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    const draft = drawingRef.current;
    drawingRef.current = null;
    if (draft.type === 'objectEraser') {
      if (draft.remainingAnnotations.length !== draft.originalAnnotations.length) {
        commitAnnotations(draft.remainingAnnotations);
      }
      return;
    }
    const shouldKeep = draft.type === 'brush' || draft.type === 'eraser'
      ? draft.points.length >= 2
      : Math.abs(draft.width) >= 1 && Math.abs(draft.height) >= 1;
    redraw();
    if (shouldKeep) commitAnnotations([...annotations, draft]);
  };

  const handleSave = async () => {
    const image = imageRef.current;
    if (!image || !projectPath) {
      setError(projectPath ? 'Source image is not loaded.' : 'Project path is unavailable.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const dataUrl = exportAnnotatedImage(image, annotations);
      const result = await uploadImageToInput(dataUrl, {
        projectPath,
        sourceKind: 'annotate',
        filename: `annotation-${Date.now()}.png`,
        mimeType: 'image/png',
      });
      onSave({
        annotations: cloneAnnotations(annotations),
        annotatedImagePath: result.url,
        imageSize,
        brushColor: color,
        brushSize,
        eraserMode,
        eraserSize,
      });
    } catch (saveError) {
      console.error('[AnnotateModal] Save failed:', saveError);
      setError(saveError?.message || 'Failed to save annotated image.');
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div
      className="nodrag nopan nowheel fixed inset-0 z-[10000] flex flex-col bg-[#0b0b0b]/98 text-white"
      onPointerDown={(event) => event.stopPropagation()}
      onPointerMove={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 bg-[#151515] px-4 py-3">
        <div className="mr-2 text-sm font-medium text-white/80">Image Annotate</div>
        {TOOLS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            title={label}
            aria-label={label}
            onClick={() => setTool(value)}
            className={`flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ${tool === value ? 'border-white bg-white text-black' : 'border-white/10 bg-white/5 text-white/65 hover:bg-white/15 hover:text-white'}`}
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <ToolIcon tool={value} />
            </svg>
          </button>
        ))}
        {tool === 'eraser' && (
          <div className="flex items-center rounded-lg border border-white/10 bg-white/5 p-0.5">
            {['local', 'object'].map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setEraserMode(mode)}
                className={`rounded-md px-2.5 py-1.5 text-[10px] capitalize transition-colors ${eraserMode === mode ? 'bg-white text-black' : 'text-white/55 hover:text-white'}`}
              >
                {mode}
              </button>
            ))}
          </div>
        )}
        <div className="mx-1 h-6 w-px bg-white/10" />
        {COLORS.map((value) => (
          <button key={value} type="button" aria-label={`Color ${value}`} onClick={() => setColor(value)} className={`h-7 w-7 rounded-full border-2 ${color === value ? 'border-white' : 'border-white/15'}`} style={{ backgroundColor: value }} />
        ))}
        <label className="ml-2 flex items-center gap-2 text-xs text-white/60">
          Size
          <input
            type="range"
            min="1"
            max="64"
            value={activeSize}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (tool === 'eraser') setEraserSize(value);
              else setBrushSize(value);
            }}
            className="w-28"
          />
          <span className="w-6 text-right">{activeSize}</span>
        </label>
        <div className="mx-1 h-6 w-px bg-white/10" />
        <button type="button" disabled={historyIndex <= 0} onClick={undo} className="rounded-lg bg-white/10 px-3 py-2 text-xs text-white/70 disabled:opacity-30">Undo</button>
        <button type="button" disabled={historyIndex >= history.length - 1} onClick={redo} className="rounded-lg bg-white/10 px-3 py-2 text-xs text-white/70 disabled:opacity-30">Redo</button>
        <button type="button" disabled={!annotations.length} onClick={() => commitAnnotations([])} className="rounded-lg bg-white/10 px-3 py-2 text-xs text-white/70 disabled:opacity-30">Clear</button>
        <div className="flex-1" />
        <button type="button" onClick={requestCancel} className="rounded-lg bg-white/10 px-4 py-2 text-xs text-white/70">Cancel</button>
        <button type="button" disabled={saving || !imageSize.width} onClick={handleSave} className="rounded-lg bg-[#007aff] px-4 py-2 text-xs font-medium text-white disabled:opacity-40">{saving ? 'Saving...' : 'Save'}</button>
      </div>

      {sourceChanged && (
        <div className="border-b border-amber-400/20 bg-amber-400/10 px-4 py-2 text-xs text-amber-200">
          The upstream image changed. Clear old annotations and edit them again if they no longer align.
        </div>
      )}
      {error && <div className="border-b border-red-400/20 bg-red-400/10 px-4 py-2 text-xs text-red-200">{error}</div>}

      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-4">
        <canvas
          ref={canvasRef}
          width={imageSize.width || 1}
          height={imageSize.height || 1}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerEnter={updateCursorPreview}
          onPointerLeave={() => setCursorPreview(null)}
          className="max-h-full max-w-full touch-none bg-black object-contain shadow-2xl"
          style={{
            aspectRatio: imageSize.width && imageSize.height ? `${imageSize.width} / ${imageSize.height}` : '1 / 1',
            cursor: tool === 'brush' || tool === 'eraser' ? 'none' : 'crosshair',
          }}
        />
        <img
          ref={imageRef}
          src={resolvedImageUrl}
          alt=""
          crossOrigin="anonymous"
          className="hidden"
          onLoad={(event) => {
            const width = event.currentTarget.naturalWidth;
            const height = event.currentTarget.naturalHeight;
            setImageSize({ width, height });
          }}
          onError={() => setError('Failed to load source image.')}
        />
      </div>
      {cursorPreview && (tool === 'brush' || tool === 'eraser') && (
        <div
          className="pointer-events-none fixed z-[10001] rounded-full"
          style={{
            left: cursorPreview.x,
            top: cursorPreview.y,
            width: cursorPreview.diameter,
            height: cursorPreview.diameter,
            transform: 'translate(-50%, -50%)',
            border: `1px solid ${tool === 'brush' ? color : 'rgba(255,255,255,0.85)'}`,
            background: tool === 'eraser' ? 'rgba(255,255,255,0.12)' : `${color}18`,
            boxShadow: '0 0 0 1px rgba(0,0,0,0.45)',
          }}
        />
      )}
    </div>,
    document.body
  );
}
