import { lazy, memo, Suspense, useMemo, useState } from 'react';
import { Handle, Position, useEdges, useNodes, useReactFlow } from '@xyflow/react';
import { NodeResizeCorner } from '../components/NodeResizeCorner';
import { getNodeImageOutput } from '../utils/nodeOutputs';
import { resolveImageUrl } from '../utils/resolveImageUrl';
import { getImageInputNodeSizeByRatio } from '../utils/imageInputSizing';
import { countRender } from '../utils/perfDebug';
import { getMatchingPreviewUrl } from '../utils/imagePreview';

const PanoramaViewerModal = lazy(() =>
  import('../components/PanoramaViewerModal').then((module) => ({
    default: module.PanoramaViewerModal,
  }))
);

const SINGLE_CAPTURE_OFFSET = { x: 440, y: 0 };
const FOUR_VIEW_GAP = { x: 300, y: 230 };

const getFirstImageUrl = (output) => {
  if (!Array.isArray(output)) return '';
  const first = output.find(Boolean);
  if (!first) return '';
  return typeof first === 'string' ? first : first.url || first.src || first.imageUrl || '';
};

const formatAngle = (value) => `${Math.round(Number(value) || 0)}°`;
const getSourceType = (mode) => (mode === 'panorama360' ? 'panorama360Node' : 'ar720Node');

export const SpatialPreviewNode = memo(function SpatialPreviewNode({ id, data, mode, title }) {
  countRender('SpatialPreviewNode');
  const nodes = useNodes();
  const edges = useEdges();
  const { getNodes, setNodes } = useReactFlow();
  const [isViewerOpen, setIsViewerOpen] = useState(false);

  const sourceImageUrl = useMemo(() => {
    const inputEdge = edges.find(
      (edge) => edge.target === id && (edge.targetHandle ?? edge.targetHandleId) === 'image:in'
    );
    if (!inputEdge) return '';

    const sourceNode = nodes.find((node) => node.id === inputEdge.source);
    return getFirstImageUrl(getNodeImageOutput(sourceNode, inputEdge.sourceHandle, inputEdge, nodes, edges));
  }, [edges, id, nodes]);
  const sourcePreviewUrl = useMemo(() => {
    const inputEdge = edges.find(
      (edge) => edge.target === id && (edge.targetHandle ?? edge.targetHandleId) === 'image:in'
    );
    const sourceNode = nodes.find((node) => node.id === inputEdge?.source);
    return getMatchingPreviewUrl(sourceNode?.data, sourceImageUrl);
  }, [edges, id, nodes, sourceImageUrl]);
  const resolvedSourceImageUrl = resolveImageUrl(sourcePreviewUrl);

  const viewerState = {
    yaw: Number(data?.viewerState?.yaw) || 0,
    pitch: Number(data?.viewerState?.pitch) || 0,
    fov: Number(data?.viewerState?.fov) || 70,
  };

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

  const handleViewerStateCommit = (nextState) => {
    updateNodeData({ viewerState: nextState });
  };

  const createCaptureImageInputNodes = (captures = []) => {
    const validCaptures = captures.filter((capture) => capture?.dataUrl);
    if (!validCaptures.length) return;

    const allNodes = getNodes();
    const currentNode = allNodes.find((node) => node.id === id);
    const existingCaptureCount = allNodes.filter(
      (node) => node.type === 'imageInputNode' && node.data?.source?.nodeId === id
    ).length;
    const groupOffset = Math.floor(existingCaptureCount / 4) * 44;
    const baseX = (currentNode?.position?.x || 0) + SINGLE_CAPTURE_OFFSET.x + groupOffset;
    const baseY = (currentNode?.position?.y || 0) + SINGLE_CAPTURE_OFFSET.y + groupOffset;
    const batchId = Date.now();

    const nodesToAdd = validCaptures.map((capture, index) => {
      const isBatch = validCaptures.length > 1;
      const fittedSize = getImageInputNodeSizeByRatio(capture.width, capture.height);
      const position = isBatch
        ? {
            x: baseX + (index % 2) * FOUR_VIEW_GAP.x,
            y: baseY + Math.floor(index / 2) * FOUR_VIEW_GAP.y,
          }
        : {
            x: baseX,
            y: baseY + existingCaptureCount * 36,
          };

      return {
        id: `imageInputNode-${batchId}-${index}`,
        type: 'imageInputNode',
        position,
        width: fittedSize.width,
        height: fittedSize.height,
        data: {
          url: capture.dataUrl,
          dataUrl: capture.dataUrl,
          filename: capture.filename || `${mode}_capture_${batchId}_${index + 1}.png`,
          generatedByPanorama: true,
          displayMode: 'cover',
          source: {
            type: getSourceType(mode),
            nodeId: id,
            label: capture.label,
            yaw: capture.yaw,
            pitch: capture.pitch,
            fov: capture.fov,
            exportAspectRatio: capture.exportAspectRatio,
            exportResolution: capture.exportResolution,
            exportWidth: capture.width,
            exportHeight: capture.height,
          },
        },
      };
    });

    setNodes((nds) => nds.concat(nodesToAdd));
  };

  const statusItems =
    mode === 'panorama360'
      ? [`FOV ${Math.round(viewerState.fov)}`, `Yaw ${formatAngle(viewerState.yaw)}`]
      : [`FOV ${Math.round(viewerState.fov)}`, `Yaw ${formatAngle(viewerState.yaw)}`, `Pitch ${formatAngle(viewerState.pitch)}`];

  return (
    <div className="relative h-full min-h-[240px] w-full min-w-[340px] select-none text-white group">
      <div className="canvas-node-card canvas-image-node-card relative flex h-full min-h-[240px] w-full min-w-[340px] flex-col overflow-hidden rounded-[24px] border border-white/5 bg-[#181818] transition-colors duration-100 hover:border-white/20">
        <div className="pointer-events-none absolute left-4 right-4 top-4 z-20 flex items-center justify-between gap-3">
          <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/10 bg-black/35 px-3 py-2 text-xs font-light text-white/70 backdrop-blur-md">
            <svg className="h-3.5 w-3.5 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3a9 9 0 100 18 9 9 0 000-18ZM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" />
            </svg>
            <span>{title}</span>
          </div>

          <button
            type="button"
            disabled={!sourceImageUrl}
            onClick={(event) => {
              event.stopPropagation();
              console.log('[SpatialPreview image input]', {
                nodeId: id,
                type: mode,
                imageUrlPrefix: sourceImageUrl?.startsWith('data:image/')
                  ? `${sourceImageUrl.slice(0, 60)}...`
                  : sourceImageUrl,
                imageUrlLength: sourceImageUrl?.length,
              });
              setIsViewerOpen(true);
            }}
            className="pointer-events-auto nodrag nopan rounded-full border border-white/10 bg-black/35 px-3 py-2 text-[10px] font-light text-white/60 backdrop-blur-md transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
          >
            Open Viewer
          </button>
        </div>

        <div className="relative flex-1 bg-black/30">
          {resolvedSourceImageUrl ? (
            <img
              src={resolvedSourceImageUrl}
              alt={`${title} preview`}
              draggable={false}
              className="canvas-image-preview absolute inset-0 h-full w-full object-cover pointer-events-none select-none"
            />
          ) : (
            <div className="flex h-full min-h-[170px] items-center justify-center text-sm font-light text-white/25">
              Connect image
            </div>
          )}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/40" />
        </div>

        <div className="flex h-11 shrink-0 items-center gap-3 border-t border-white/5 bg-[#141414]/90 px-4 text-[10px] font-light uppercase tracking-[0.16em] text-white/35 backdrop-blur-md">
          {statusItems.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      </div>

      <Handle
        type="target"
        id="image:in"
        position={Position.Left}
        className="!left-[-5px] !top-1/2 !z-30 !h-2 !w-2 !-translate-y-1/2 !rounded-full !border !border-white/40 !bg-[#121212] transition-all group-hover:!border-white"
      />

      <NodeResizeCorner minWidth={340} minHeight={240} />

      {isViewerOpen && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 text-sm font-light text-white/35 backdrop-blur-xl">
              Loading panorama viewer...
            </div>
          }
        >
          <PanoramaViewerModal
            open={isViewerOpen}
            title={title}
            imageUrl={sourceImageUrl}
            mode={mode}
            viewerState={viewerState}
            onViewerStateCommit={handleViewerStateCommit}
            onCreateImageInput={(capture) => createCaptureImageInputNodes([capture])}
            onCreateImageInputs={createCaptureImageInputNodes}
            onClose={() => setIsViewerOpen(false)}
          />
        </Suspense>
      )}
    </div>
  );
});
