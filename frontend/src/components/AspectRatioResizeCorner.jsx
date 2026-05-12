import { useCallback, useEffect, useRef } from 'react';
import { useNodeId, useUpdateNodeInternals } from '@xyflow/react';

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

export function AspectRatioResizeCorner({
  value,
  min = 0.6,
  max = 2,
  sensitivity = 300,
  disabled = false,
  onChange,
  onCommit,
}) {
  const id = useNodeId();
  const updateNodeInternals = useUpdateNodeInternals();
  const dragRef = useRef(null);
  const rafRef = useRef(null);

  const scheduleUpdateInternals = useCallback(() => {
    if (!id || rafRef.current) return;

    rafRef.current = requestAnimationFrame(() => {
      updateNodeInternals(id);
      rafRef.current = null;
    });
  }, [id, updateNodeInternals]);

  useEffect(
    () => () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    },
    []
  );

  const cleanup = () => {
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);
    dragRef.current = null;
  };

  const handlePointerMove = (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (!dragRef.current) return;

    const dx = event.clientX - dragRef.current.startX;
    const dy = event.clientY - dragRef.current.startY;
    const delta = Math.abs(dx) > Math.abs(dy) ? dx : dy;
    const nextValue = clamp(
      dragRef.current.startValue + delta / dragRef.current.sensitivity,
      dragRef.current.min,
      dragRef.current.max
    );
    dragRef.current.currentValue = nextValue;
    onChange?.(nextValue);
    scheduleUpdateInternals();
  };

  const handlePointerUp = (event) => {
    event.preventDefault();
    event.stopPropagation();

    const dragState = dragRef.current;
    const finalValue = dragState?.currentValue ?? value;
    cleanup();
    onCommit?.(clamp(finalValue, dragState?.min ?? min, dragState?.max ?? max));
    scheduleUpdateInternals();
  };

  const handlePointerDown = (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (disabled) return;

    const startValue = clamp(value, min, max);
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      startValue,
      currentValue: startValue,
      min,
      max,
      sensitivity,
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  return (
    <div
      className={`nodrag nopan absolute -bottom-1.5 -right-1.5 z-50 h-6 w-6 bg-transparent border-none group/resize ${
        disabled ? 'cursor-not-allowed opacity-20' : 'cursor-nwse-resize'
      }`}
      onPointerDown={handlePointerDown}
    >
      <div className="absolute bottom-1.5 right-1.5 w-3 h-3 rounded-br-[8px] border-r border-b border-white/20 group-hover/resize:border-white/65 transition-colors" />
      <div className="absolute bottom-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-white/15 group-hover/resize:bg-white/55 transition-colors" />
    </div>
  );
}
