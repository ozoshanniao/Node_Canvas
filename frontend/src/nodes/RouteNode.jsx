import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { NodeResizeCorner } from '../components/NodeResizeCorner';
import { countRender } from '../utils/perfDebug';

const handleClass =
  '!h-2 !w-2 !rounded-full !border !border-white/40 !bg-[#121212] transition-all group-hover:!border-white';

export const RouteNode = memo(function RouteNode() {
  countRender('RouteNode');
  return (
    <div className="relative h-full min-h-[180px] w-full min-w-[280px] select-none text-white group">
      <div className="canvas-node-card relative flex h-full w-full flex-col overflow-hidden rounded-[24px] border border-white/5 bg-[#181818] transition-colors duration-100 hover:border-white/20">
        <div className="absolute top-4 left-4 z-20 flex items-center gap-2 text-white/50 text-[11px] font-light bg-[#121212]/60 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/5 pointer-events-none">
          <svg className="h-3.5 w-3.5 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 7h8m0 0-3-3m3 3-3 3M20 17h-8m0 0 3-3m-3 3 3 3M4 17h5M15 7h5" />
          </svg>
          <span>Route</span>
        </div>

        <div className="flex flex-1 items-center justify-center px-6 pt-">
          <div className="text-center text-xs font-light uppercase tracking-[0.18em] text-white/25">
            Text / Image Route
          </div>
        </div>
      </div>

      <PortLabel side="left" top="36%" label="Text" />
      <Handle
        type="target"
        id="text:in"
        position={Position.Left}
        className={`${handleClass} !left-[-5px] !top-[36%] !-translate-y-1/2`}
      />

      <PortLabel side="left" top="64%" label="Image" />
      <Handle
        type="target"
        id="image:in"
        position={Position.Left}
        className={`${handleClass} !left-[-5px] !top-[64%] !-translate-y-1/2`}
      />

      <PortLabel side="right" top="36%" label="Text" />
      <Handle
        type="source"
        id="text:out"
        position={Position.Right}
        className={`${handleClass} !right-[-5px] !top-[36%] !-translate-y-1/2`}
      />

      <PortLabel side="right" top="64%" label="Image" />
      <Handle
        type="source"
        id="image:out"
        position={Position.Right}
        className={`${handleClass} !right-[-5px] !top-[64%] !-translate-y-1/2`}
      />

      <NodeResizeCorner minWidth={280} minHeight={180} />
    </div>
  );
});

function PortLabel({ side, top, label }) {
  const sideClass = side === 'left' ? 'left-3' : 'right-3';
  return (
    <div
      className={`pointer-events-none absolute ${sideClass} z-30 -translate-y-1/2 text-[10px] font-light text-white/30`}
      style={{ top }}
    >
      {label}
    </div>
  );
}
