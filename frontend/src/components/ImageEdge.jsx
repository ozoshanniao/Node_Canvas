// src/components/ImageEdge.jsx
import { memo, useCallback, useEffect } from 'react';
import { getBezierPath, EdgeLabelRenderer, useReactFlow, useStore } from '@xyflow/react';
import { countRender, DISABLE_EDGE_ANIMATION, PERF_DEBUG } from '../utils/perfDebug';
import {
  normalizeImageInputEdgeLabels,
  shouldShowEdgeControls,
  shouldShowImageInputEdgeLabel,
} from '../utils/edgeLabels';

function ImageEdge({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  targetHandle,
  targetHandleId,
  selected,
  data = {},
  style = {},
  markerEnd,
  ...props
}) {
  countRender('ImageEdge');
  const { setEdges } = useReactFlow();
  const resolvedTargetHandle = targetHandleId ?? targetHandle;
  const sourceSelected = useStore(
    (store) => store.nodeLookup?.get(source)?.selected
  );
  const targetSelected = useStore(
    (store) => store.nodeLookup?.get(target)?.selected
  );
  const showEdgeControls = shouldShowEdgeControls({ selected, sourceSelected, targetSelected });

  const inputLabel =
    data?.inputLabel ||
    data?.label ||
    (resolvedTargetHandle === 'image:end' ? 'END' : '') ||
    (typeof data?.imageIndex === 'number' ? `image${data.imageIndex + 1}` : '');
  const showImageLabel = shouldShowImageInputEdgeLabel(
    resolvedTargetHandle,
    inputLabel,
    showEdgeControls
  );
  const isFlowing = Boolean(data?.flowing);

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const handleEdgeDelete = useCallback(
    (event) => {
      event.stopPropagation();
      setEdges((edges) => normalizeImageInputEdgeLabels(edges.filter((edge) => edge.id !== id)));
    },
    [id, setEdges]
  );

  useEffect(() => {
    if (PERF_DEBUG && isFlowing) {
      console.log('[ImageEdge flowing]', id, {
        inputLabel,
        imageIndex: data?.imageIndex,
      });
    }
  }, [data?.imageIndex, id, inputLabel, isFlowing]);

  return (
    <>
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        className="cursor-pointer"
        pointerEvents="stroke"
      />

      <path
        id={id}
        style={style}
        className={`react-flow__edge-path pointer-events-none ${
          selected || isFlowing ? 'stroke-white/55' : 'stroke-white/20'
        }`}
        d={edgePath}
        markerEnd={markerEnd ?? props.markerEnd}
      />

      {isFlowing && !DISABLE_EDGE_ANIMATION && (
        <path
          d={edgePath}
          fill="none"
          className="edge-flowing-overlay"
        />
      )}

      {(showImageLabel || showEdgeControls) && (
        <EdgeLabelRenderer>
          <>
            {showImageLabel && (
              <div
                className="nodrag nopan bg-[#181818] border border-white/20 px-2 py-0.5 rounded-md shadow-2xl"
                style={{
                  position: 'absolute',
                  transform: `translate(-50%, -50%) translate(${labelX * 0.6 + sourceX * 0.4}px, ${
                    labelY * 0.6 + sourceY * 0.4
                  }px)`,
                  pointerEvents: 'none',
                }}
              >
                <span className="text-[11px] font-bold text-white/90">{inputLabel}</span>
              </div>
            )}

            {showEdgeControls && (
              <button
                type="button"
                onClick={handleEdgeDelete}
                className="nodrag nopan w-5 h-5 bg-[#141414] border border-white/5 rounded-full flex items-center justify-center text-white/40 hover:text-red-500 hover:border-red-500 shadow-xl"
                style={{
                position: 'absolute',
                zIndex: 25,
                transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
                pointerEvents: 'all',
              }}
            >
              <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-16v1a1 1 0 001 1h3m-10 0h3m0 0V4a1 1 0 011-1h4a1 1 0 011 1v3M4 7h16"
                />
              </svg>
              </button>
            )}
          </>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export default memo(ImageEdge);
