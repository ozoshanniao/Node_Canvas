import { NodeResizeControl } from '@xyflow/react';

export function NodeResizeCorner({ minWidth, minHeight, keepAspectRatio = false }) {
  return (
    <NodeResizeControl
      minWidth={minWidth}
      minHeight={minHeight}
      keepAspectRatio={keepAspectRatio}
      className="nodrag nopan absolute -bottom-1.5 -right-1.5 z-50 !w-6 !h-6 !bg-transparent !border-none cursor-nwse-resize group/resize"
    >
      <div className="absolute bottom-1.5 right-1.5 w-3 h-3 rounded-br-[8px] border-r border-b border-white/20 group-hover/resize:border-white/65 transition-colors" />
      <div className="absolute bottom-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-white/15 group-hover/resize:bg-white/55 transition-colors" />
    </NodeResizeControl>
  );
}
