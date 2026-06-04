import { useCallback } from 'react';
import { useReactFlow } from '@xyflow/react';

export const useImageAspect = (id, containerRef) => {
  const { setNodes } = useReactFlow();

  const handleImageLoad = useCallback((e) => {
    const { naturalWidth, naturalHeight } = e.target;
    if (!naturalWidth || !naturalHeight) return;

    const imageAspect = naturalWidth / naturalHeight;
    // 抓取当前节点在画布上的真实渲染宽度
    const currentWidth = containerRef.current?.offsetWidth || 480;
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
  }, [id, setNodes, containerRef]);

  return handleImageLoad;
};