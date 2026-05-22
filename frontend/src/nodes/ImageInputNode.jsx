import { memo, useEffect, useMemo, useRef } from 'react';
import { Handle, Position, useEdges, useNodes, useReactFlow, useUpdateNodeInternals } from '@xyflow/react';
import { NodeResizeCorner } from '../components/NodeResizeCorner';
import { getNodeImageOutput } from '../utils/nodeOutputs';
import { resolveImageUrl } from '../utils/resolveImageUrl';
import { getImageInputNodeSizeByRatio, getImageInputNodeSizeFromImageUrl } from '../utils/imageInputSizing';
import { countRender, PERF_DEBUG } from '../utils/perfDebug';
import { uploadImageToInput } from '../utils/uploadToInput';

const SPLIT_GRID_FIT_FALLBACK_SIZE = 260;

const getFirstImageUrl = (output) => {
  if (!Array.isArray(output)) return '';
  const first = output.find(Boolean);
  if (!first) return '';
  return typeof first === 'string' ? first : first.url || first.src || first.imageUrl || '';
};

const getFittedSizeFromImage = (naturalWidth, naturalHeight) => {
  const ratio =
    naturalWidth && naturalHeight
      ? naturalWidth / naturalHeight
      : 1;

  if (!ratio || !Number.isFinite(ratio)) {
    return {
      width: SPLIT_GRID_FIT_FALLBACK_SIZE,
      height: SPLIT_GRID_FIT_FALLBACK_SIZE,
    };
  }

  return getImageInputNodeSizeByRatio(naturalWidth, naturalHeight, {
    minSize: 0,
  });
};

export const ImageInputNode = memo(function ImageInputNode({ id, data }) {
  countRender('ImageInputNode');
  const fileInputRef = useRef(null);
  const containerRef = useRef(null);
  const { setNodes } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const rawImageSrc = data?.url || data?.dataUrl || data?.imageUrl || data?.src;
  const imageSrc = resolveImageUrl(rawImageSrc, data?.projectPath);
  const isGeneratedBySplitGrid = Boolean(data?.generatedBySplitGrid);
  const isFittedPreview = Boolean(
    data?.generatedBySplitGrid ||
      data?.generatedByPanorama ||
      data?.generatedByOutput ||
      data?.importedByUser ||
      data?.displayMode === 'cover'
  );

  const imageObjectFit =
    isFittedPreview
      ? 'object-cover'
      : data?.displayMode === 'contain'
        ? 'object-contain'
        : data?.displayMode === 'fill'
          ? 'object-cover'
          : 'object-contain';
  const containerSizeClass = isFittedPreview
    ? 'min-w-0 min-h-0'
    : 'min-w-[320px] min-h-[240px]';

  useEffect(() => {
    const describeImageValue = (value) => {
      if (!value) return { type: 'empty', length: 0 };
      if (typeof value !== 'string') return { type: typeof value, length: 0 };
      if (value.startsWith('data:image/')) return { type: 'dataURL', length: value.length, preview: value.slice(0, 80) };
      if (value.startsWith('blob:')) return { type: 'blobURL', length: value.length, preview: value.slice(0, 80) };
      if (value.startsWith('http://') || value.startsWith('https://')) return { type: 'httpURL', length: value.length, preview: value.slice(0, 80) };
      return { type: 'filePathOrOther', length: value.length, preview: value.slice(0, 80) };
    };

    if (!PERF_DEBUG) return;

    console.log('[ImageInputNode render:image]', {
      nodeId: id,
      fields: {
        url: describeImageValue(data?.url),
        dataUrl: describeImageValue(data?.dataUrl),
        imageUrl: describeImageValue(data?.imageUrl),
        src: describeImageValue(data?.src),
        previewUrl: describeImageValue(data?.previewUrl),
      },
      selectedSrc: describeImageValue(imageSrc),
    });

    if (data?.url?.startsWith?.('blob:')) {
      console.warn('[ImageInputNode invalid-persistent-src]', {
        nodeId: id,
        reason: 'blob URL cannot survive reload; upload this image again so it can be saved as dataURL',
        preview: data.url.slice(0, 80),
      });
    }
  }, [id, data?.url, data?.dataUrl, data?.imageUrl, data?.src, data?.previewUrl, imageSrc]);

  // 核心智能逻辑：当图片加载完毕后，自动精准校准整个卡片的宽高比
  const handleImageLoad = (e) => {
    const { naturalWidth, naturalHeight } = e.target;
    if (!naturalWidth || !naturalHeight) return;

    if (isGeneratedBySplitGrid) {
      const fittedSliceUrl = rawImageSrc;
      if (!fittedSliceUrl || data?.fittedSliceUrl === fittedSliceUrl) return;

      const nextSize = getFittedSizeFromImage(naturalWidth, naturalHeight);

      setNodes((nds) =>
        nds.map((node) => {
          if (node.id !== id) return node;

          const widthChanged = Math.abs((node.width || 0) - nextSize.width) > 1;
          const heightChanged = Math.abs((node.height || 0) - nextSize.height) > 1;

          if (!widthChanged && !heightChanged && node.data?.fittedSliceUrl === fittedSliceUrl) {
            return node;
          }

          return {
            ...node,
            width: widthChanged ? nextSize.width : node.width,
            height: heightChanged ? nextSize.height : node.height,
            data: {
              ...node.data,
              fittedSliceUrl,
            },
          };
        })
      );
      requestAnimationFrame(() => updateNodeInternals(id));
      return;
    }

    if (isFittedPreview) {
      requestAnimationFrame(() => updateNodeInternals(id));
      return;
    }
    
    const imageAspect = naturalWidth / naturalHeight;
    const currentWidth = containerRef.current?.offsetWidth || 320;
    const perfectHeight = currentWidth / imageAspect;

    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === id) {
          return {
            ...node,
            width: currentWidth,
            height: perfectHeight,
          };
        }
        return node;
      })
    );
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;

    // Get projectPath from node data
    const projectPath = data?.projectPath;
    if (!projectPath) {
      console.error('[ImageInputNode] projectPath not available for upload');
      return;
    }

    try {
      // Upload to input directory
      const result = await uploadImageToInput(file, {
        projectPath,
        sourceKind: 'upload',
        filename: file.name,
        mimeType: file.type,
      });

      // Get node size from uploaded image
      const imageUrl = resolveImageUrl(result.url, projectPath);
      const nextSize = await getImageInputNodeSizeFromImageUrl(imageUrl).catch(() => null);

      // Update node with relative path only
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id === id) {
            return {
              ...node,
              ...(nextSize ? { width: nextSize.width, height: nextSize.height } : {}),
              data: {
                ...node.data,
                url: result.url, // e.g., "input/upload_a3f2b1c4.png"
                filename: result.filename,
                mimeType: result.mimeType,
                width: result.width,
                height: result.height,
                bytes: result.bytes,
                sourceKind: 'upload',
                importedByUser: true,
                displayMode: 'cover',
                projectPath,
              },
            };
          }
          return node;
        })
      );
      requestAnimationFrame(() => updateNodeInternals(id));
    } catch (error) {
      console.error('[ImageInputNode] Upload failed:', error);
    }
  };

  const handleDoubleClick = (e) => {
    e.stopPropagation(); // 关键：防止触发 App.jsx 中的双击搜索框
    fileInputRef.current?.click();
  };

  return (
    // 修正位置 1：外层主容器移除了 overflow-hidden，放行 Handle 触控点
    <div 
      ref={containerRef}
      onDoubleClick={handleDoubleClick}
      className={`canvas-node-card canvas-image-node-card bg-[#181818] rounded-[24px] w-full h-full ${containerSizeClass} select-none group relative border border-white/5 transition-colors duration-100 hover:border-white/20`}
    >
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        accept="image/png, image/jpeg, image/jpg, image/webp" 
        className="hidden" 
      />
      
      {/* 顶部悬浮文字标签栏 */}
      <div className="absolute top-4 left-4 z-20 flex items-center gap-2 text-white/50 text-[11px] font-light bg-[#121212]/60 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/5 pointer-events-none">
        <svg className="w-3.5 h-3.5 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 002-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <span>Image Input</span>
      </div>

      {/* 修正位置 2：将 rounded-[24px] overflow-hidden 绑定在图片画布上，精准剪裁图片边缘 */}
      <div 
        className="image-input-preview-surface pointer-events-none absolute inset-0 nowheel flex select-none items-center justify-center rounded-[24px] overflow-hidden bg-white/[0.005]"
      >
        {imageSrc ? (
          <img 
            src={imageSrc} 
            alt="Input Source" 
            onLoad={handleImageLoad}
            draggable={false}
            className={`canvas-image-preview absolute inset-0 w-full h-full ${imageObjectFit} pointer-events-none select-none transition-opacity duration-150`}
          />
        ) : (
          <div className="text-white/20 text-sm font-extralight tracking-wide hover:text-white/40 transition-colors pt-4">
            Double Click to Upload Image
          </div>
        )}
      </div>

      {/* 右侧输出连接点：现在安全暴露，可顺畅连线 */}
      <Handle
        type="target"
        id="image:in"
        position={Position.Left}
        className="!w-2 !h-2 !bg-[#121212] !border !border-white/40 !rounded-full !left-[-4px] group-hover:!border-white transition-all z-30"
      />

      <Handle
        type="source"
        id="image:out" 
        position={Position.Right}
        className="!w-2 !h-2 !bg-[#121212] !border !border-white/40 !rounded-full !right-[-4px] group-hover:!border-white transition-all z-30"
      />

      {/* 智能等比例拉伸触控区 */}
      <NodeResizeCorner
        minWidth={isFittedPreview ? 24 : 320}
        minHeight={isFittedPreview ? 24 : 240}
        keepAspectRatio={!!imageSrc}
      />

      {data?.hasImageInputConnection && (
        <UpstreamImageBridge
          nodeId={id}
          currentData={data}
        />
      )}
    </div>
  );
});

function UpstreamImageBridge({ nodeId, currentData }) {
  const nodes = useNodes();
  const edges = useEdges();
  const { setNodes } = useReactFlow();

  const incomingImage = useMemo(() => {
    const inputEdge = edges.find(
      (edge) => edge.target === nodeId && (edge.targetHandle ?? edge.targetHandleId) === 'image:in'
    );
    if (!inputEdge) return { url: '', edgeHasSliceIndex: false };

    const currentNode = nodes.find((node) => node.id === nodeId);
    if (currentNode?.dragging || currentNode?.resizing) return { url: '', edgeHasSliceIndex: false };

    const sourceNode = nodes.find((node) => node.id === inputEdge.source);
    return {
      url: getFirstImageUrl(getNodeImageOutput(sourceNode, inputEdge.sourceHandle, inputEdge, nodes, edges)),
      edgeHasSliceIndex: typeof inputEdge.data?.sliceIndex === 'number',
    };
  }, [edges, nodeId, nodes]);
  const incomingImageUrl = incomingImage.url;
  const edgeHasSliceIndex = incomingImage.edgeHasSliceIndex;

  useEffect(() => {
    if (!incomingImageUrl) return;

    // Note: We no longer write dataUrl to node.data to avoid storing base64 in project files.
    // If upstream sends data:image/, we accept it as url but don't duplicate to dataUrl field.
    const isSynced =
      currentData?.url === incomingImageUrl &&
      currentData?.receivedImageUrl === incomingImageUrl;

    if (isSynced) return;

    const currentUrl =
      currentData?.url ||
      currentData?.imageUrl ||
      currentData?.src ||
      currentData?.outputs?.imageUrl ||
      '';
    const isSplitChild =
      Boolean(currentData?.generatedBySplitGrid) ||
      typeof currentData?.sliceIndex === 'number';

    if (
      isSplitChild &&
      currentUrl &&
      !edgeHasSliceIndex &&
      incomingImageUrl !== currentUrl
    ) {
      return;
    }

    setNodes((nds) =>
      nds.map((node) => {
        if (node.id !== nodeId) return node;

        const nodeData = node.data || {};
        const nodeIsSynced =
          nodeData.url === incomingImageUrl &&
          nodeData.receivedImageUrl === incomingImageUrl;

        if (nodeIsSynced) return node;

        const nodeCurrentUrl =
          nodeData.url ||
          nodeData.imageUrl ||
          nodeData.src ||
          nodeData.outputs?.imageUrl ||
          '';
        const nodeIsSplitChild =
          Boolean(nodeData.generatedBySplitGrid) ||
          typeof nodeData.sliceIndex === 'number';

        if (
          nodeIsSplitChild &&
          nodeCurrentUrl &&
          !edgeHasSliceIndex &&
          incomingImageUrl !== nodeCurrentUrl
        ) {
          return node;
        }

        return {
          ...node,
          data: {
            ...nodeData,
            ...(nodeData.url !== incomingImageUrl ? { url: incomingImageUrl } : {}),
            ...(nodeData.receivedImageUrl !== incomingImageUrl ? { receivedImageUrl: incomingImageUrl } : {}),
          },
        };
      })
    );
  }, [
    currentData?.receivedImageUrl,
    currentData?.imageUrl,
    currentData?.outputs?.imageUrl,
    currentData?.sliceIndex,
    currentData?.src,
    currentData?.url,
    currentData?.generatedBySplitGrid,
    edgeHasSliceIndex,
    incomingImageUrl,
    nodeId,
    setNodes,
  ]);

  return null;
}
