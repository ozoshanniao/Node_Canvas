import { memo, useEffect, useMemo, useState } from 'react';
import { Handle, Position, useEdges, useNodes, useReactFlow, useUpdateNodeInternals } from '@xyflow/react';
import { OutputImageModal } from '../components/OutputImageModal';
import { AspectRatioResizeCorner } from '../components/AspectRatioResizeCorner';
import { getNodeImageOutput } from '../utils/nodeOutputs';
import { resolveImageUrl } from '../utils/resolveImageUrl';
import { getImageInputNodeSizeByRatio, getImageInputNodeSizeFromImageUrl } from '../utils/imageInputSizing';
import { countRender } from '../utils/perfDebug';
import { createImageThumbnail, getBestPreviewUrl } from '../utils/imagePreview';

const DEFAULT_SCALE = 1;
const MIN_SCALE = 0.6;
const MAX_SCALE = 2;
const DEFAULT_MAX_W = 520;
const DEFAULT_MAX_H = 520;

const clampIndex = (index, length) => {
  if (!length) return 0;
  return Math.min(Math.max(index, 0), length - 1);
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const getOutputDefaultSizeByImageRatio = (ratio) => {
  const safeRatio = ratio > 0 && Number.isFinite(ratio) ? ratio : 1;
  const boxRatio = DEFAULT_MAX_W / DEFAULT_MAX_H;

  if (safeRatio >= boxRatio) {
    return {
      width: DEFAULT_MAX_W,
      height: DEFAULT_MAX_W / safeRatio,
    };
  }

  return {
    width: DEFAULT_MAX_H * safeRatio,
    height: DEFAULT_MAX_H,
  };
};

const normalizeImageItems = (images = []) =>
  images
    .map((item, index) => {
      if (typeof item === 'string') {
        return {
          id: `legacy-${index}-${item}`,
          url: item,
          createdAt: '',
          sourceNodeId: '',
        };
      }
      return item?.url ? item : null;
    })
    .filter(Boolean);

export const OutputNode = memo(function OutputNode({ id, data }) {
  countRender('OutputNode');
  const nodes = useNodes();
  const edges = useEdges();
  const { setNodes } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [imageMeta, setImageMeta] = useState({});
  const [previewScale, setPreviewScale] = useState(null);

  const upstreamImages = useMemo(() => {
    const nodeMap = new Map(nodes.map((node) => [node.id, node]));
    return edges
      .filter(
        (edge) =>
          edge.target === id &&
          (edge.targetHandle ?? edge.targetHandleId) === 'image:in'
      )
      .flatMap((edge) =>
        getNodeImageOutput(nodeMap.get(edge.source), edge.sourceHandle, edge, nodes, edges).map((url) => ({
          url,
          sourceNodeId: edge.source,
        }))
      )
      .filter(Boolean);
  }, [edges, id, nodes]);

  const imageItems = useMemo(() => normalizeImageItems(data.images), [data.images]);
  const imageUrls = useMemo(() => imageItems.map((item) => item.url).filter(Boolean), [imageItems]);
  const existingImageUrlSet = useMemo(() => new Set(imageUrls), [imageUrls]);
  const newUpstreamItems = useMemo(
    () =>
      upstreamImages
        .filter((item) => item.url && !existingImageUrlSet.has(item.url))
        .map((item, index) => ({
          id: `${item.sourceNodeId || 'image'}-${Date.now()}-${index}`,
          url: item.url,
          createdAt: new Date().toISOString(),
          sourceNodeId: item.sourceNodeId || '',
        })),
    [existingImageUrlSet, upstreamImages]
  );
  const selectedIndex = clampIndex(data.selectedIndex ?? 0, imageUrls.length);
  const selectedItem = imageItems[selectedIndex];
  const selectedUrl = imageUrls[selectedIndex];
  const hasMatchingPreview =
    selectedItem?.previewUrl && (!selectedItem?.previewSourceUrl || selectedItem.previewSourceUrl === selectedUrl);
  const resolvedSelectedUrl = resolveImageUrl(
    getBestPreviewUrl({
      ...selectedItem,
      previewUrl: hasMatchingPreview ? selectedItem.previewUrl : '',
      url: selectedUrl,
    })
  );
  const currentMeta = selectedUrl ? imageMeta[selectedUrl] : null;
  const hasCurrentMeta = !!currentMeta?.width && !!currentMeta?.height;
  const currentRatio =
    hasCurrentMeta
      ? currentMeta.width / currentMeta.height
      : 1;
  const legacyScale =
    data.displayScale == null && data.displaySizeBase
      ? data.displaySizeBase / 360
      : null;
  const rawScale = previewScale ?? data.displayScale ?? legacyScale ?? DEFAULT_SCALE;
  const displayScale = clamp(rawScale, MIN_SCALE, MAX_SCALE);
  const defaultSize = getOutputDefaultSizeByImageRatio(currentRatio);
  const nodeWidth = defaultSize.width * displayScale;
  const nodeHeight = defaultSize.height * displayScale;

  useEffect(() => {
    updateNodeInternals(id);
  }, [id, nodeHeight, nodeWidth, updateNodeInternals]);

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
    if (newUpstreamItems.length > 0) {
      updateNodeData({
        images: [...imageItems, ...newUpstreamItems],
        selectedIndex: imageItems.length + newUpstreamItems.length - 1,
      });
      return;
    }

    if ((data.selectedIndex ?? 0) !== selectedIndex) {
      updateNodeData({ selectedIndex });
    }
  }, [data.selectedIndex, imageItems, newUpstreamItems, selectedIndex]);

  useEffect(() => {
    if (!selectedUrl) return undefined;
    if (selectedItem?.previewUrl && selectedItem?.previewSourceUrl === selectedUrl) return undefined;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      createImageThumbnail(selectedUrl).then((thumbnail) => {
        if (cancelled || !thumbnail) return;

        setNodes((nds) =>
          nds.map((node) => {
            if (node.id !== id) return node;

            const currentImages = normalizeImageItems(node.data?.images);
            const nextImages = currentImages.map((item, index) => {
              const isSelectedItem =
                index === selectedIndex ||
                (selectedItem?.id && item.id === selectedItem.id) ||
                item.url === selectedUrl;

              if (!isSelectedItem) return item;
              if (item.previewUrl && item.previewSourceUrl === selectedUrl) return item;

              return {
                ...item,
                previewUrl: thumbnail,
                previewSourceUrl: selectedUrl,
              };
            });

            return {
              ...node,
              data: {
                ...node.data,
                images: nextImages,
              },
            };
          })
        );
      });
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [id, selectedIndex, selectedItem?.id, selectedItem?.previewSourceUrl, selectedItem?.previewUrl, selectedUrl, setNodes]);

  const selectIndex = (nextIndex) => {
    updateNodeData({ selectedIndex: clampIndex(nextIndex, imageUrls.length) });
  };

  const goPrevious = (event) => {
    event.stopPropagation();
    if (imageUrls.length <= 1) return;
    selectIndex((selectedIndex - 1 + imageUrls.length) % imageUrls.length);
  };

  const goNext = (event) => {
    event.stopPropagation();
    if (imageUrls.length <= 1) return;
    selectIndex((selectedIndex + 1) % imageUrls.length);
  };

  const handleUseAsImageInput = async (url) => {
    if (!url) return;

    const currentNode = nodes.find((node) => node.id === id);
    const imageIndex = imageUrls.indexOf(url);
    const meta = imageMeta[url];
    let imageInputSize = meta?.width && meta?.height
      ? getImageInputNodeSizeByRatio(meta.width, meta.height)
      : getImageInputNodeSizeByRatio(16, 9);

    if (!meta?.width || !meta?.height) {
      try {
        imageInputSize = await getImageInputNodeSizeFromImageUrl(url);
      } catch (error) {
        console.warn('[OutputNode use-as-image-input size failed]', {
          nodeId: id,
          imageIndex,
          error,
        });
      }
    }

    const position = {
      x: (currentNode?.position?.x || 0) + 360,
      y: currentNode?.position?.y || 0,
    };

    const newNode = {
      id: `imageInputNode-${Date.now()}`,
      type: 'imageInputNode',
      position,
      width: imageInputSize.width,
      height: imageInputSize.height,
      data: {
        url,
        ...(url.startsWith('data:image/') ? { dataUrl: url } : {}),
        ...(selectedItem?.previewUrl ? { previewUrl: selectedItem.previewUrl, previewSourceUrl: url } : {}),
        generatedByOutput: true,
        displayMode: 'cover',
        source: {
          type: 'outputNode',
          nodeId: id,
          imageIndex: imageIndex >= 0 ? imageIndex : undefined,
          width: meta?.width,
          height: meta?.height,
        },
      },
    };

    setNodes((nds) => nds.concat(newNode));
    setIsModalOpen(false);
  };

  return (
    <div
      className="relative text-white select-none group"
      style={{ width: `${nodeWidth}px`, height: `${nodeHeight}px` }}
    >
      <div className="canvas-node-card canvas-image-node-card relative w-full h-full rounded-[24px] overflow-hidden bg-[#181818] border border-white/5 transition-colors duration-100 hover:border-white/20">
        {resolvedSelectedUrl ? (
          <>
            <img
              src={resolvedSelectedUrl}
              alt="Output preview"
              onLoad={(event) => {
                const { naturalWidth, naturalHeight } = event.currentTarget;
                if (naturalWidth && naturalHeight) {
                  setImageMeta((current) => ({
                    ...current,
                    [selectedUrl]: { width: naturalWidth, height: naturalHeight },
                  }));
                }
                requestAnimationFrame(() => updateNodeInternals(id));
              }}
              draggable={false}
              className="canvas-image-preview absolute inset-0 h-full w-full object-cover pointer-events-none select-none"
            />

            {imageUrls.length > 1 && (
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
              {selectedIndex + 1} / {imageUrls.length}
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

      </div>

      <Handle
        type="target"
        id="image:in"
        position={Position.Left}
        className="!w-2 !h-2 !bg-[#121212] !border !border-white/40 !rounded-full !left-[-5px] !top-1/2 !-translate-y-1/2 group-hover:!border-white transition-all !z-30"
      />

      <AspectRatioResizeCorner
        value={displayScale}
        min={MIN_SCALE}
        max={MAX_SCALE}
        sensitivity={300}
        disabled={!hasCurrentMeta}
        onChange={setPreviewScale}
        onCommit={(nextScale) => {
          setPreviewScale(null);
          updateNodeData({ displayScale: clamp(nextScale, MIN_SCALE, MAX_SCALE) });
        }}
      />

      <OutputImageModal
        open={isModalOpen}
        images={imageUrls}
        selectedIndex={selectedIndex}
        onSelectIndex={selectIndex}
        onClose={() => setIsModalOpen(false)}
        onUseAsImageInput={handleUseAsImageInput}
      />
    </div>
  );
});
