import { useEffect, useMemo, useState } from 'react';
import { Handle, Position, useEdges, useNodes, useReactFlow } from '@xyflow/react';
import { OutputImageModal } from '../components/OutputImageModal';
import { NodeResizeCorner } from '../components/NodeResizeCorner';
import { getNodeImageOutput } from '../utils/nodeOutputs';

const clampIndex = (index, length) => {
  if (!length) return 0;
  return Math.min(Math.max(index, 0), length - 1);
};

export function OutputNode({ id, data }) {
  const nodes = useNodes();
  const edges = useEdges();
  const { setNodes } = useReactFlow();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const images = useMemo(() => {
    const nodeMap = new Map(nodes.map((node) => [node.id, node]));
    return edges
      .filter(
        (edge) =>
          edge.target === id &&
          (edge.targetHandle ?? edge.targetHandleId) === 'image:in'
      )
      .flatMap((edge) => getNodeImageOutput(nodeMap.get(edge.source)))
      .filter(Boolean);
  }, [edges, id, nodes]);

  const selectedIndex = clampIndex(data.selectedIndex ?? 0, images.length);
  const selectedUrl = images[selectedIndex];

  const updateNodeData = (nextData) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === id) {
          return { ...node, data: { ...node.data, ...nextData } };
        }
        return node;
      })
    );
  };

  useEffect(() => {
    if ((data.selectedIndex ?? 0) !== selectedIndex) {
      updateNodeData({ selectedIndex });
    }
  }, [data.selectedIndex, selectedIndex]);

  const selectIndex = (nextIndex) => {
    updateNodeData({ selectedIndex: clampIndex(nextIndex, images.length) });
  };

  const goPrevious = (event) => {
    event.stopPropagation();
    if (images.length <= 1) return;
    selectIndex((selectedIndex - 1 + images.length) % images.length);
  };

  const goNext = (event) => {
    event.stopPropagation();
    if (images.length <= 1) return;
    selectIndex((selectedIndex + 1) % images.length);
  };

  const handleUseAsImageInput = (url) => {
    if (!url) return;

    const currentNode = nodes.find((node) => node.id === id);
    const position = {
      x: (currentNode?.position?.x || 0) + 360,
      y: currentNode?.position?.y || 0,
    };

    const newNode = {
      id: `imageInputNode-${Date.now()}`,
      type: 'imageInputNode',
      position,
      data: {
        url,
        ...(url.startsWith('data:image/') ? { dataUrl: url } : {}),
      },
    };

    setNodes((nds) => nds.concat(newNode));
    setIsModalOpen(false);
  };

  return (
    <div className="relative w-full h-full min-w-[320px] min-h-[240px] text-white select-none group">
      <div className="relative w-full h-full rounded-[24px] overflow-hidden bg-[#181818] border border-white/5 hover:ring-2 hover:ring-white/50 hover:drop-shadow-[0_0_10px_rgba(255,255,255,0.1)] transition-[box-shadow,filter] duration-150">
        {selectedUrl ? (
          <>
            <img
              src={selectedUrl}
              alt="Output preview"
              onClick={() => setIsModalOpen(true)}
              className="absolute inset-0 h-full w-full object-cover cursor-pointer"
            />

            {images.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={goPrevious}
                  className="nodrag nopan absolute left-4 top-1/2 z-20 h-8 w-8 -translate-y-1/2 rounded-full border border-white/10 bg-black/45 text-white/55 backdrop-blur-md transition-colors hover:bg-white/15 hover:text-white"
                >
                  &lt;
                </button>
                <button
                  type="button"
                  onClick={goNext}
                  className="nodrag nopan absolute right-4 top-1/2 z-20 h-8 w-8 -translate-y-1/2 rounded-full border border-white/10 bg-black/45 text-white/55 backdrop-blur-md transition-colors hover:bg-white/15 hover:text-white"
                >
                  &gt;
                </button>
              </>
            )}

            <div className="absolute bottom-4 right-4 z-20 rounded-full border border-white/10 bg-black/45 px-3 py-1 text-[10px] font-light text-white/70 backdrop-blur-md">
              {selectedIndex + 1} / {images.length}
            </div>
          </>
        ) : (
          <div className="h-full w-full flex items-center justify-center bg-[#181818] text-sm font-light text-white/25">
            No image connected
          </div>
        )}

        <div className="absolute top-4 left-4 right-4 z-30 flex items-center justify-between gap-3 pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/10 bg-black/35 px-3 py-2 text-xs font-light text-white/70 backdrop-blur-md">
            <svg className="w-3.5 h-3.5 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 7h16M4 17h16M7 4v16M17 4v16" />
            </svg>
            <span>Output</span>
          </div>

          <button
            type="button"
            disabled={!selectedUrl}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setIsModalOpen(true);
            }}
            className="pointer-events-auto nodrag nopan rounded-full border border-white/10 bg-black/35 px-4 py-2 text-[10px] font-light text-white/65 backdrop-blur-md transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
          >
            Expand
          </button>
        </div>

        <Handle
          type="target"
          id="image:in"
          position={Position.Left}
          className="!w-2 !h-2 !bg-[#121212] !border !border-white/40 !rounded-full !left-[-4px] group-hover:!border-white transition-all"
        />

        <NodeResizeCorner minWidth={320} minHeight={240} />
      </div>

      <OutputImageModal
        open={isModalOpen}
        images={images}
        selectedIndex={selectedIndex}
        onSelectIndex={selectIndex}
        onClose={() => setIsModalOpen(false)}
        onUseAsImageInput={handleUseAsImageInput}
      />
    </div>
  );
}
