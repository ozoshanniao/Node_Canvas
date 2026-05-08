import { Handle, Position, NodeResizeControl, useReactFlow } from '@xyflow/react';

export function TextNode({ id, data }) {
  const { setNodes } = useReactFlow(); // 🌟 注入全局节点数据改写工具

  // 🌟 1. 状态直接受控于全局 data 树，无缝承接默认值
  const text = data.text || '';

  // 🌟 2. 建立文本专用的穿透派发管道
  const handleTextChange = (e) => {
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === id) {
          return { ...node, data: { ...node.data, text: e.target.value } };
        }
        return node;
      })
    );
  };

  return (
    <div className="bg-[#181818] rounded-[24px] px-4 pt-3 pb-4 w-full h-full min-w-[320px] min-h-[200px] flex flex-col text-white select-none group hover:ring-2 hover:ring-white/50 hover:drop-shadow-[0_0_10px_rgba(255,255,255,0.1)] transition-all relative">
      
      {/* 顶部小标题：极简浅灰色调 */}
      <div className="flex items-center gap-2 mb-2 px-1">

        {/* 左侧：图标 + Text */}
        <div className="flex items-center gap-2 text-white/30 text-xs font-light">
        <svg className="w-3.5 h-3.5 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h11" />
        </svg>
        <span>Text</span>
      </div>

      {/* 右侧：@ 标志 (注意：不要给它套 w-full 或者额外的 div) */}
      <span className="bg-white/5 text-white/20 text-[9px] px-1.5 py-0.5 rounded-md font-light tracking-tighter">
        @
      </span>
    </div>

      {/* 文本区域：彻底去除内边框与独立背景，与节点卡片融为一体 */}
      <div className="flex-1 relative">
        <textarea
          value={text}               // 🌟 受控于全局变量
          onChange={handleTextChange} // 🌟 实时把打字状态轰送给大画布指挥部
          placeholder="Type your prompt here..." /* 顺手加个优雅的暗黑占位提示词 */
          className="nodrag nowheel w-full h-full bg-transparent text-white/90 placeholder-white/20 resize-none focus:outline-none text-sm font-light tracking-wide leading-relaxed pr-4 pb-4"
        />
        </div>

{/* 右侧微型连接点：平时半透明，悬浮时高亮 */}
      <Handle
        type="source"
        id="text:out"// 声明这是一个 text 类型的输出端口
        position={Position.Right}
        className="!w-2 !h-2 !bg-[#121212] !border !border-white/40 !rounded-full !right-[-4px] group-hover:!border-white transition-all"
      />

      {/* Windows 直觉式角落拉伸控制区（24x24像素隐形热区） */}
      <NodeResizeControl 
        className="absolute bottom-0 right-0 w-12 h-12 cursor-se-resize z-50 !bg-transparent !border-none"
        minWidth={320} 
        minHeight={200} 
      />
    </div>
  );
}
