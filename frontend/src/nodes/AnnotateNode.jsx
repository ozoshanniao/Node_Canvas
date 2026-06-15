import { memo, useMemo, useState } from 'react';
import { Handle, Position, useEdges, useNodes, useReactFlow } from '@xyflow/react';
import { AnnotateModal } from '../components/AnnotateModal';
import { NodeResizeCorner } from '../components/NodeResizeCorner';
import { createAnnotationSourceKey, isAnnotationSourceCurrent } from '../utils/annotationUtils';
import { getNodeImageOutput } from '../utils/nodeOutputs';
import { resolveImageUrl } from '../utils/resolveImageUrl';

const getFirstImageUrl = (output) => {
  const first = Array.isArray(output) ? output.find(Boolean) : '';
  return typeof first === 'string' ? first : first?.url || '';
};

export const AnnotateNode = memo(function AnnotateNode({ id, data }) {
  const nodes = useNodes();
  const edges = useEdges();
  const { setNodes } = useReactFlow();
  const [modalOpen, setModalOpen] = useState(false);

  const upstreamImage = useMemo(() => {
    const edge = edges.find(
      (item) => item.target === id && (item.targetHandle ?? item.targetHandleId) === 'image:in'
    );
    if (!edge) return '';
    const sourceNode = nodes.find((node) => node.id === edge.source);
    return getFirstImageUrl(getNodeImageOutput(sourceNode, edge.sourceHandle, edge, nodes, edges));
  }, [edges, id, nodes]);

  const sourceIsCurrent = isAnnotationSourceCurrent(data?.sourceImageKey, upstreamImage) && (
    !data?.currentSourceImageKey || data.currentSourceImageKey === data.sourceImageKey
  );
  const sourceChanged = Boolean(upstreamImage && data?.sourceImageKey && !sourceIsCurrent);
  const previewPath = sourceIsCurrent && data?.annotatedImagePath
    ? data.annotatedImagePath
    : upstreamImage;
  const previewUrl = resolveImageUrl(previewPath, data?.projectPath);

  const updateNodeData = (nextData) => {
    setNodes((current) => current.map((node) => (
      node.id === id ? { ...node, data: { ...node.data, ...nextData } } : node
    )));
  };

  return (
    <div className="relative h-full min-h-[220px] w-full min-w-[320px] select-none text-white group">
      <div className={`canvas-node-card canvas-image-node-card relative h-full w-full overflow-hidden rounded-[24px] border bg-[#181818] transition-colors ${sourceChanged ? 'border-amber-400/50' : 'border-white/5 hover:border-white/20'}`}>
        {previewUrl ? (
          <img
            src={previewUrl}
            alt="Annotation preview"
            draggable={false}
            className="canvas-image-preview pointer-events-none absolute inset-0 h-full w-full object-contain"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm font-light text-white/25">
            Connect image input
          </div>
        )}
        {upstreamImage && (
          <img
            src={resolveImageUrl(upstreamImage, data?.projectPath)}
            alt=""
            className="hidden"
            onLoad={(event) => {
              const nextSize = {
                width: event.currentTarget.naturalWidth,
                height: event.currentTarget.naturalHeight,
              };
              const nextKey = createAnnotationSourceKey(upstreamImage, nextSize.width, nextSize.height);
              if (data?.currentSourceImageKey !== nextKey) {
                updateNodeData({
                  currentSourceImage: upstreamImage,
                  currentSourceImageKey: nextKey,
                  currentImageSize: nextSize,
                });
              }
            }}
          />
        )}

        <div className="absolute left-4 right-4 top-4 z-20 flex items-start justify-between gap-3">
          <div className="pointer-events-none flex items-center gap-2 rounded-full border border-white/5 bg-[#121212]/60 px-3 py-1.5 text-[11px] font-light text-white/50 backdrop-blur-md">
            <svg className="h-3.5 w-3.5 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 20l4.5-1 10-10a2.12 2.12 0 00-3-3l-10 10L4 20zm10-12l3 3" />
            </svg>
            <span>Image Annotate</span>
          </div>
          <button
            type="button"
            disabled={!upstreamImage}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setModalOpen(true);
            }}
            className="nodrag nopan rounded-full border border-white/10 bg-[#121212]/60 px-3 py-1.5 text-[10px] font-light text-white/60 backdrop-blur-md transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
          >
            Edit
          </button>
        </div>

        {sourceChanged && (
          <div className="absolute bottom-4 left-4 right-4 rounded-xl border border-amber-400/20 bg-black/65 px-3 py-2 text-[10px] text-amber-200 backdrop-blur-md">
            Upstream image changed. Existing annotations may be invalid.
          </div>
        )}
      </div>

      <Handle type="target" id="image:in" position={Position.Left} className="!left-[-5px] !h-2 !w-2 !rounded-full !border !border-white/40 !bg-[#121212] group-hover:!border-white" />
      <Handle type="source" id="image:out" position={Position.Right} className="!right-[-5px] !h-2 !w-2 !rounded-full !border !border-white/40 !bg-[#121212] group-hover:!border-white" />
      <NodeResizeCorner minWidth={320} minHeight={220} />

      <AnnotateModal
        open={modalOpen}
        imageUrl={upstreamImage}
        projectPath={data?.projectPath}
        initialAnnotations={data?.annotations}
        initialColor={data?.brushColor}
        initialBrushSize={data?.brushSize}
        initialEraserMode={data?.eraserMode}
        initialEraserSize={data?.eraserSize}
        sourceChanged={sourceChanged}
        onCancel={() => setModalOpen(false)}
        onSave={(result) => {
          const sourceImageKey = createAnnotationSourceKey(
            upstreamImage,
            result.imageSize.width,
            result.imageSize.height
          );
          updateNodeData({
            ...result,
            sourceImageKey,
            currentSourceImageKey: sourceImageKey,
            currentSourceImage: upstreamImage,
            updatedAt: new Date().toISOString(),
          });
          setModalOpen(false);
        }}
      />
    </div>
  );
});
