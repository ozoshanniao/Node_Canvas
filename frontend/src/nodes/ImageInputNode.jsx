import { useEffect, useRef } from 'react';
import { Handle, Position, useReactFlow } from '@xyflow/react';
import { NodeResizeCorner } from '../components/NodeResizeCorner';

export function ImageInputNode({ id, data }) {
  const fileInputRef = useRef(null);
  const containerRef = useRef(null);
  const { setNodes } = useReactFlow();
  const imageSrc = data?.url || data?.dataUrl || data?.imageUrl || data?.src;

  useEffect(() => {
    const describeImageValue = (value) => {
      if (!value) return { type: 'empty', length: 0 };
      if (typeof value !== 'string') return { type: typeof value, length: 0 };
      if (value.startsWith('data:image/')) return { type: 'dataURL', length: value.length, preview: value.slice(0, 80) };
      if (value.startsWith('blob:')) return { type: 'blobURL', length: value.length, preview: value.slice(0, 80) };
      if (value.startsWith('http://') || value.startsWith('https://')) return { type: 'httpURL', length: value.length, preview: value.slice(0, 80) };
      return { type: 'filePathOrOther', length: value.length, preview: value.slice(0, 80) };
    };

    console.log('[ImageInputNode render:image]', {
      nodeId: id,
      fields: {
        url: describeImageValue(data?.url),
        dataUrl: describeImageValue(data?.dataUrl),
        imageUrl: describeImageValue(data?.imageUrl),
        src: describeImageValue(data?.src),
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
  }, [id, data?.url, data?.dataUrl, data?.imageUrl, data?.src, imageSrc]);

  // 核心智能逻辑：当图片加载完毕后，自动精准校准整个卡片的宽高比
  const handleImageLoad = (e) => {
    const { naturalWidth, naturalHeight } = e.target;
    if (!naturalWidth || !naturalHeight) return;
    
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

  const fileToDataUrl = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const dataUrl = await fileToDataUrl(file);
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id === id) {
            return {
              ...node,
              data: {
                ...node.data,
                url: dataUrl,
                dataUrl,
                filename: file.name,
                mimeType: file.type,
                file: undefined,
              },
            };
          }
          return node;
        })
      );
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
      className="bg-[#181818] rounded-[24px] w-full h-full min-w-[320px] min-h-[240px] select-none group hover:ring-2 hover:ring-white/50 hover:drop-shadow-[0_0_10px_rgba(255,255,255,0.1)] transition-all relative border border-white/5"
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
        onMouseDown={(e) => e.stopPropagation()}
        onDoubleClick={handleDoubleClick} // 🌟 关键修改：onClick -> onDoubleClick
        className="absolute inset-0 nowheel flex items-center justify-center bg-white/[0.005] hover:bg-white/[0.02] transition-all cursor-pointer rounded-[24px] overflow-hidden"
      >
        {imageSrc ? (
          <img 
            src={imageSrc} 
            alt="Input Source" 
            onLoad={handleImageLoad}
            className="absolute inset-0 w-full h-full object-contain pointer-events-none transition-all duration-500"
          />
        ) : (
          <div className="text-white/20 text-sm font-extralight tracking-wide hover:text-white/40 transition-colors pt-4">
            Double Click to Upload Image
          </div>
        )}
      </div>

      {/* 右侧输出连接点：现在安全暴露，可顺畅连线 */}
      <Handle
        type="source"
        id="image:out" 
        position={Position.Right}
        className="!w-2 !h-2 !bg-[#121212] !border !border-white/40 !rounded-full !right-[-4px] group-hover:!border-white transition-all z-30"
      />

      {/* 智能等比例拉伸触控区 */}
      <NodeResizeCorner minWidth={320} minHeight={240} keepAspectRatio={!!imageSrc} />
    </div>
  );
}
