// src/components/ImageEdge.jsx
import { memo, useEffect } from 'react';
import { getBezierPath, useStore } from '@xyflow/react';
import { EdgeActionToolbar } from './EdgeActionToolbar';
import { countRender, DISABLE_EDGE_ANIMATION, PERF_DEBUG } from '../utils/perfDebug';
import {
  getDerivedImageInputEdgeLabel,
  getImageEdgeUiVisibility,
} from '../utils/edgeLabels';

const EDGE_LOCAL_UI_WIDTH = 112;
const EDGE_LOCAL_UI_HEIGHT = 32;

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
  const resolvedTargetHandle = targetHandleId ?? targetHandle;
  const sourceSelected = useStore(
    (store) => Boolean(store.nodeLookup?.get(source)?.selected)
  );
  const targetSelected = useStore(
    (store) => Boolean(store.nodeLookup?.get(target)?.selected)
  );
  const inputLabel = useStore((store) =>
    getDerivedImageInputEdgeLabel(
      {
        id,
        source,
        target,
        targetHandle: resolvedTargetHandle,
        data,
      },
      store.edges || []
    )
  );
  const { showImageLabel, showDeleteControl } = getImageEdgeUiVisibility({
    selected,
    sourceSelected,
    targetSelected,
    targetHandle: resolvedTargetHandle,
    inputLabel,
  });
  const isFlowing = Boolean(data?.flowing);

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });
  const localUiX = labelX;
  const localUiY = labelY;

  useEffect(() => {
    if (PERF_DEBUG && isFlowing) {
      console.log('[ImageEdge flowing]', id, {
        inputLabel,
        connectionOrder: data?.connectionOrder,
      });
    }
  }, [data?.connectionOrder, id, inputLabel, isFlowing]);

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
        className={'react-flow__edge-path pointer-events-none ' + (
          selected || isFlowing ? 'stroke-white/55' : 'stroke-white/20'
        )}
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

      {(showImageLabel || showDeleteControl) && (
        <foreignObject
          x={localUiX - EDGE_LOCAL_UI_WIDTH / 2}
          y={localUiY - EDGE_LOCAL_UI_HEIGHT / 2}
          width={EDGE_LOCAL_UI_WIDTH}
          height={EDGE_LOCAL_UI_HEIGHT}
          overflow="visible"
          data-edge-local-ui="true"
          className="overflow-visible pointer-events-none"
          style={{ overflow: 'visible', pointerEvents: 'none' }}
        >
          <div
            xmlns="http://www.w3.org/1999/xhtml"
            data-edge-local-content="true"
            className="flex w-full h-full items-center justify-center gap-1 box-border pointer-events-none"
          >
            {showImageLabel && (
              <span
                data-edge-local-label-slot="true"
                className={showDeleteControl
                  ? 'flex flex-1 min-w-0 items-center justify-end pointer-events-none'
                  : 'contents'}
              >
                <span
                  data-edge-image-label="true"
                  className="pointer-events-none inline-flex flex-none items-center justify-center box-border leading-none bg-[#181818]/90 border border-white/15 px-2 py-0.5 rounded-md text-[11px] font-semibold text-white/80 whitespace-nowrap shadow-sm"
                >
                  {inputLabel}
                </span>
              </span>
            )}

            {showDeleteControl && (
              <EdgeActionToolbar edgeId={id} />
            )}

            {showImageLabel && showDeleteControl && (
              <span
                aria-hidden="true"
                data-edge-local-balance-slot="true"
                className="flex-1 min-w-0 pointer-events-none"
              />
            )}
          </div>
        </foreignObject>
      )}
    </>
  );
}

export default memo(ImageEdge);
