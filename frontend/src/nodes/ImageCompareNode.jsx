import { memo, useMemo, useRef } from 'react';
import { Handle, Position, useEdges, useNodes, useReactFlow } from '@xyflow/react';
import { NodeResizeCorner } from '../components/NodeResizeCorner';
import { getNodeImageOutput } from '../utils/nodeOutputs';
import { resolveImageUrl } from '../utils/resolveImageUrl';
import { countRender } from '../utils/perfDebug';
import { getMatchingPreviewUrl } from '../utils/imagePreview';

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const getFirstImageUrl = (output) => {
  if (!Array.isArray(output)) return '';
  const first = output.find(Boolean);
  if (!first) return '';
  return typeof first === 'string' ? first : first.url || first.src || first.imageUrl || '';
};

export const ImageCompareNode = memo(function ImageCompareNode({ id, data }) {
  countRender('ImageCompareNode');
  const containerRef = useRef(null);
  const nodes = useNodes();
  const edges = useEdges();
  const { setNodes } = useReactFlow();
  const splitPosition = clamp(Number(data?.splitPosition) || 50, 0, 100);

  const nodeMap = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);

  const getInputImage = (handleId) => {
    const edge = edges.find(
      (item) => item.target === id && (item.targetHandle ?? item.targetHandleId) === handleId
    );
    if (!edge) return { url: '', previewUrl: '' };

    const sourceNode = nodeMap.get(edge.source);
    const url = getFirstImageUrl(getNodeImageOutput(sourceNode, edge.sourceHandle, edge, nodes, edges));
    return {
      url,
      previewUrl: getMatchingPreviewUrl(sourceNode?.data, url),
    };
  };

  const imageA = useMemo(() => getInputImage('image:a'), [edges, id, nodeMap, nodes]);
  const imageB = useMemo(() => getInputImage('image:b'), [edges, id, nodeMap, nodes]);
  const resolvedImageA = resolveImageUrl(imageA.previewUrl || imageA.url);
  const resolvedImageB = resolveImageUrl(imageB.previewUrl || imageB.url);
  const hasBothImages = Boolean(resolvedImageA && resolvedImageB);
  const singleImage = resolvedImageA || resolvedImageB;
  const missingLabel = !resolvedImageA && !resolvedImageB
    ? 'Connect image A and B'
    : !resolvedImageA
      ? 'Connect image A'
      : !resolvedImageB
        ? 'Connect image B'
        : '';

  const updateNodeData = (nextData) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id !== id) return node;
        return {
          ...node,
          data: {
            ...node.data,
            ...nextData,
          },
        };
      })
    );
  };

  const handlePointerDown = (event) => {
    event.preventDefault();
    event.stopPropagation();

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect?.width) return;

    const updateFromClientX = (clientX) => {
      const next = ((clientX - rect.left) / rect.width) * 100;
      updateNodeData({ splitPosition: clamp(next, 0, 100) });
    };

    updateFromClientX(event.clientX);

    const handlePointerMove = (moveEvent) => {
      moveEvent.preventDefault();
      updateFromClientX(moveEvent.clientX);
    };

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  const handleReset = (event) => {
    event.preventDefault();
    event.stopPropagation();
    updateNodeData({ splitPosition: 50 });
  };

  return (
    <div className="relative h-full min-h-[220px] w-full min-w-[320px] select-none text-white group">
      <div
        ref={containerRef}
        className="canvas-node-card canvas-image-node-card relative h-full w-full overflow-hidden rounded-[24px] border border-white/5 bg-[#181818] transition-colors duration-100 hover:border-white/20"
      >
        <div className="absolute inset-0 bg-black/30">
          {hasBothImages ? (
            <>
              <img
                src={resolvedImageB}
                alt="Compare B"
                draggable={false}
                className="canvas-image-preview absolute inset-0 h-full w-full object-contain pointer-events-none select-none"
              />
              <div
                className="absolute inset-0 overflow-hidden"
                style={{ clipPath: `inset(0 ${100 - splitPosition}% 0 0)` }}
              >
                <img
                  src={resolvedImageA}
                  alt="Compare A"
                  draggable={false}
                  className="canvas-image-preview absolute inset-0 h-full w-full object-contain pointer-events-none select-none"
                />
              </div>
            </>
          ) : singleImage ? (
            <img
              src={singleImage}
              alt="Compare input"
              draggable={false}
              className="canvas-image-preview absolute inset-0 h-full w-full object-contain pointer-events-none select-none"
            />
          ) : null}

          {missingLabel && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/20 px-6 text-center text-sm font-light text-white/30">
              {missingLabel}
            </div>
          )}
        </div>

        {hasBothImages && (
          <div
            className="nodrag nopan absolute bottom-0 top-0 z-30 w-px bg-white/50"
            style={{ left: `${splitPosition}%` }}
          >
            <button
              type="button"
              onPointerDown={handlePointerDown}
              className="nodrag nopan absolute left-1/2 top-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full border border-white/15 bg-black/45 text-xs font-light text-white/75 shadow-lg backdrop-blur-md transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Drag comparison split"
            >
              <span className="tracking-[-0.12em]">‹ ›</span>
            </button>
          </div>
        )}

        <div className="pointer-events-none absolute left-4 right-4 top-4 z-40 flex items-center justify-between gap-3">
          <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/10 bg-black/35 px-3 py-2 text-xs font-light text-white/70 backdrop-blur-md">
            <svg className="h-3.5 w-3.5 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 3v18M16 3v18M3 8h18M3 16h18" />
            </svg>
            <span>Image Compare</span>
          </div>

          {hasBothImages && (
            <button
              type="button"
              onClick={handleReset}
              className="pointer-events-auto nodrag nopan rounded-full border border-white/10 bg-black/35 px-3 py-2 text-[10px] font-light text-white/60 backdrop-blur-md transition-colors hover:bg-white/10 hover:text-white"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      <div className="pointer-events-none absolute left-2 top-[38%] z-30 -translate-y-1/2 text-[10px] font-light text-white/35">
        A
      </div>
      <Handle
        type="target"
        id="image:a"
        position={Position.Left}
        className="!left-[-5px] !top-[38%] !z-30 !h-2 !w-2 !-translate-y-1/2 !rounded-full !border !border-white/40 !bg-[#121212] transition-all group-hover:!border-white"
      />

      <div className="pointer-events-none absolute left-2 top-[62%] z-30 -translate-y-1/2 text-[10px] font-light text-white/35">
        B
      </div>
      <Handle
        type="target"
        id="image:b"
        position={Position.Left}
        className="!left-[-5px] !top-[62%] !z-30 !h-2 !w-2 !-translate-y-1/2 !rounded-full !border !border-white/40 !bg-[#121212] transition-all group-hover:!border-white"
      />

      <NodeResizeCorner minWidth={320} minHeight={220} />
    </div>
  );
});
