import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { generateEasingPolyline, normalizeBezierHandles } from '../lib/easingFunctions.js';
import { getBezierPointFromClientRect, isFiniteRectSize, toPlotPoint, toSvgPoint } from '../utils/cubicBezierEditorGeometry.js';

const VIEW_BOX_SIZE = 100;

export function CubicBezierEditor({ handles, disabled = false, onChange, onCommit }) {
  const wrapperRef = useRef(null);
  const plotRef = useRef(null);
  const [dragging, setDragging] = useState(null);
  const [editorSize, setEditorSize] = useState({ width: 0, height: 0 });
  const safeHandles = useMemo(() => normalizeBezierHandles(handles), [handles]);
  const p1Source = { x: safeHandles.x1, y: safeHandles.y1 };
  const p2Source = { x: safeHandles.x2, y: safeHandles.y2 };
  const p1 = toSvgPoint(p1Source);
  const p2 = toSvgPoint(p2Source);
  const p1Pixel = toPlotPoint(p1Source, editorSize);
  const p2Pixel = toPlotPoint(p2Source, editorSize);
  const polyline = useMemo(
    () =>
      generateEasingPolyline(safeHandles, 56)
        .map((point) => {
          const svgPoint = toSvgPoint(point);
          return `${svgPoint.x.toFixed(2)},${svgPoint.y.toFixed(2)}`;
        })
        .join(' '),
    [safeHandles]
  );

  useLayoutEffect(() => {
    if (!plotRef.current) return undefined;

    const updateSize = () => {
      const element = plotRef.current;
      if (!element) return;
      const nextSize = { width: element.clientWidth, height: element.clientHeight };
      if (Number.isFinite(nextSize.width) && Number.isFinite(nextSize.height)) {
        setEditorSize(nextSize);
      }
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(plotRef.current);
    return () => observer.disconnect();
  }, []);

  const updatePoint = useCallback(
    (event, pointId, commit = false) => {
      const rect = plotRef.current?.getBoundingClientRect();
      const point = getBezierPointFromClientRect(event, rect);
      if (!point) return;
      const nextHandles = {
        ...safeHandles,
        [pointId === 'p1' ? 'x1' : 'x2']: point.x,
        [pointId === 'p1' ? 'y1' : 'y2']: point.y,
      };
      onChange?.(nextHandles);
      if (commit) onCommit?.(nextHandles);
    },
    [onChange, onCommit, safeHandles]
  );

  useEffect(() => {
    if (!dragging) return undefined;

    const handleMove = (event) => {
      event.preventDefault();
      updatePoint(event, dragging);
    };
    const handleUp = (event) => {
      event.preventDefault();
      updatePoint(event, dragging, true);
      setDragging(null);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp, { once: true });
    window.addEventListener('pointercancel', handleUp, { once: true });
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
    };
  }, [dragging, updatePoint]);

  const startDrag = (event, pointId) => {
    if (disabled) return;
    event.preventDefault();
    event.stopPropagation();
    setDragging(pointId);
  };

  return (
    <div
      ref={wrapperRef}
      className="nodrag nopan relative aspect-square w-full overflow-visible rounded-2xl border border-white/10 bg-black/35"
    >
      <div ref={plotRef} className="absolute inset-0 overflow-visible">
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
          <svg
            className="absolute inset-0 h-full w-full"
            viewBox={`0 0 ${VIEW_BOX_SIZE} ${VIEW_BOX_SIZE}`}
            preserveAspectRatio="none"
          >
            <path d="M0 100H100M0 75H100M0 50H100M0 25H100M0 0H100M0 0V100M25 0V100M50 0V100M75 0V100M100 0V100" stroke="rgba(255,255,255,0.06)" strokeWidth="0.8" />
            <line x1="0" y1="100" x2={p1.x} y2={p1.y} stroke="rgba(255,255,255,0.24)" strokeWidth="1" strokeLinecap="butt" />
            <line x1="100" y1="0" x2={p2.x} y2={p2.y} stroke="rgba(255,255,255,0.24)" strokeWidth="1" strokeLinecap="butt" />
            <polyline points={polyline} fill="none" stroke="rgba(255,255,255,0.82)" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        </div>
        {isFiniteRectSize(editorSize) && (
          <>
            <BezierPoint label="P1" position={p1Pixel} active={dragging === 'p1'} onPointerDown={(event) => startDrag(event, 'p1')} />
            <BezierPoint label="P2" position={p2Pixel} active={dragging === 'p2'} onPointerDown={(event) => startDrag(event, 'p2')} />
          </>
        )}
      </div>
    </div>
  );
}

function BezierPoint({ label, position, active, onPointerDown }) {
  if (!position) return null;

  return (
    <button
      type="button"
      onPointerDown={onPointerDown}
      className="nodrag nopan touch-none absolute z-30 cursor-grab pointer-events-auto"
      style={{ left: position.left, top: position.top, transform: 'translate(-50%, -50%)' }}
      aria-label={label}
    >
      <span
        className={`block h-3.5 w-3.5 rounded-full border transition-colors ${
          active
            ? 'border-white bg-white shadow-[0_0_0_5px_rgba(255,255,255,0.16)]'
            : 'border-white/80 bg-white/90 shadow-[0_0_0_4px_rgba(255,255,255,0.10)]'
        }`}
      />
      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 rounded-full border border-white/15 bg-black/55 px-1.5 py-0.5 text-[10px] font-medium leading-none text-white/70 backdrop-blur">
        {label}
      </span>
    </button>
  );
}
