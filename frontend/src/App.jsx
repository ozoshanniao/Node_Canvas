import { useState, useEffect } from 'react';
import { 
  ReactFlow, 
  Background, 
  ReactFlowProvider, 
  useReactFlow, 
  useNodesState, 
  useEdgesState,
  addEdge
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Launcher } from './components/Launcher';
import ImageEdge from './components/ImageEdge';

// 引入你构筑的所有自定义节点和连线
import { TextNode } from './nodes/TextNode';
import { ImageNode } from './nodes/ImageNode';
import { ImageInputNode } from './nodes/ImageInputNode';
//import { ButtonEdge } from './edges/ButtonEdge';

// 注册节点与连线映射表
const nodeTypes = {
  textNode: TextNode,
  imageNode: ImageNode,
  imageInputNode: ImageInputNode,
};

const edgeTypes = {
  default: ImageEdge, //default: ButtonEdge, 
};

function Flow() {
  return (
    <ReactFlow 
      nodes={nodes} 
      edges={edges}
      edgeTypes={edgeTypes} // 🌟 注册
      // ...
    />
  );
}

// 初始快照数据
const initialNodes = [
  { id: '1', type: 'textNode', position: { x: 100, y: 150 }, data: {} },
  { id: '2', type: 'imageNode', position: { x: 520, y: 150 }, data: {}, width:480, height:270 },
];

const initialEdges = [
  { id: 'e1-2', source: '1', target: '2', sourceHandle: 'text:out', targetHandle: 'text:prompt' }
];

// 核心前缀校验防呆拦截器
const isValidConnection = (c) => {
  if (!c.sourceHandle || !c.targetHandle) return false;
  return c.sourceHandle.split(':')[0] === c.targetHandle.split(':')[0];
};

function FlowCanvas({ projectPath, initialData }) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialData?.nodes || []);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialData?.edges || []);

  // 🌟 新增：如果 initialData 变了（比如通过 Launcher 加载了新项目），强制更新画布
  useEffect(() => {
    if (initialData?.nodes && initialData.nodes.length > 0) {
      const sanitizedNodes = initialData.nodes.map(node => ({
        ...node,
        position: node.position || { x: 0, y: 0 } // 🌟 防呆：如果没有坐标，给个默认值
        }));
      setNodes(sanitizedNodes);
      setEdges(initialData.edges || []);
    }
  }, [initialData, setNodes, setEdges]);

  // 这里保留 useReactFlow 只是为了获取工具函数，不需要 setFlowNodes 了
  const { screenToFlowPosition } = useReactFlow();

  // 🌟 搬迁位置：在此处插入新增 A (加载项目)
  useEffect(() => {
    const loadProject = async () => {
      const res = await fetch('http://127.0.0.1:8000/api/project/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: projectPath })
      });
      const result = await res.json();
      if (result.status === 'success' && result.data) {
        setNodes(result.data.nodes);
        if (result.data.edges) setEdges(result.data.edges);
      }
    };
    if (projectPath) loadProject();
  }, [projectPath, setNodes, setEdges]);

  // 🌟 搬迁位置：在此处插入新增 B (自动保存)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (projectPath && nodes.length > 0) {
        fetch('http://127.0.0.1:8000/api/project/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: projectPath, nodes, edges })
        });
      }
    }, 1500); 
    return () => clearTimeout(timer);
  }, [nodes, edges, projectPath]);

  // 🌟 将补丁放在这里：
  useEffect(() => {
    if (projectPath) {
      // 1. 注入到 window 全局，作为节点（如 ImageNode）的最后保底
      window.currentProjectPath = projectPath;
      
      // 2. 同时同步更新当前画布上所有节点的 data 域，确保它们都持有路径
      setNodes((nds) =>
        nds.map((node) => ({
          ...node,
          data: { ...node.data, projectPath: projectPath }
        }))
      );
    }
  }, [projectPath, setNodes]);

  // 搜索栏状态
  const [searchMenu, setSearchMenu] = useState({ show: false, x: 0, y: 0, flowPos: { x: 0, y: 0 } });
  const [query, setQuery] = useState('');

  const availableNodes = [
    { type: 'textNode', label: 'Text Input (文本输入节点)' },
    { type: 'imageNode', label: 'Image Generation (图片生成节点)' },
    { type: 'imageInputNode', label: 'Image Input (图片输入节点)' },
  ];

  const filteredNodes = availableNodes.filter(node => 
    node.label.toLowerCase().includes(query.toLowerCase())
  );

  // --- 🌟 1. 全局剪贴板图片粘贴（Paste）全场景通杀响应器 ---
  useEffect(() => {
    const handleCanvasPaste = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      const clipboardData = e.clipboardData;
      if (!clipboardData) return;

      let targetFile = null;
      let targetUrl = null;

      // 【轨道 A】优先检测标准的物理 files 集合
      const files = clipboardData.files;
      if (files && files.length > 0) {
        for (let i = 0; i < files.length; i++) {
          if (files[i].type.startsWith('image/')) {
            targetFile = files[i];
            break;
          }
        }
      }

      // 【轨道 B】降级扫描 items 实体闭包
      if (!targetFile) {
        const items = clipboardData.items || [];
        for (let i = 0; i < items.length; i++) {
          if (items[i].type.startsWith('image/')) {
            targetFile = items[i].getAsFile();
            break;
          }
        }
      }

      // 【轨道 C】网页流氓右键复制强力解析
      if (!targetFile) {
        const htmlData = clipboardData.getData('text/html');
        const textData = clipboardData.getData('text/plain');

        if (htmlData) {
          const imgMatch = htmlData.match(/<img[^>]+src=["']([^"']+)["']/i);
          if (imgMatch && imgMatch[1]) {
            targetUrl = imgMatch[1];
          }
        }

        if (!targetUrl && textData) {
          const isRemoteUrl = textData.startsWith('http://') || textData.startsWith('https://');
          const isBase64 = textData.startsWith('data:image/');
          if (isRemoteUrl || isBase64) {
            targetUrl = textData;
          }
        }
      }

      if (targetFile || targetUrl) {
        e.preventDefault();

        const flowPos = screenToFlowPosition({
          x: window.innerWidth / 2,
          y: window.innerHeight / 2,
        });

        const finalImageUrl = targetUrl ? targetUrl : URL.createObjectURL(targetFile);

        const newNode = {
          id: `imageInputNode-${Date.now()}`,
          type: 'imageInputNode',
          position: flowPos,
          data: { url: finalImageUrl, file: targetFile },
        };

        setNodes((nds) => nds.concat(newNode));
      }
    };

    window.addEventListener('paste', handleCanvasPaste);
    return () => window.removeEventListener('paste', handleCanvasPaste);
  }, [screenToFlowPosition, setNodes]);
  

  // --- 🌟 2. 外部文件夹图像拖动释放（Drop）响应器 ---
  const handleCanvasDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    
    if (file && file.type.startsWith('image/')) {
      const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const url = URL.createObjectURL(file);
      
      const newNode = {
        id: `imageInputNode-${Date.now()}`,
        type: 'imageInputNode',
        position: flowPos,
        data: { url, file },
      };
      setNodes((nds) => nds.concat(newNode));
    }
  };

  // 处理双击唤起搜索面板
  const handleContainerDoubleClick = (e) => {
    if (e.target.closest('.react-flow__node') || e.target.closest('.nodrag')) return;
    const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    setSearchMenu({ show: true, x: e.clientX, y: e.clientY, flowPos });
    setQuery('');
  };

  // 通过搜索框创建节点
  const createNode = (type) => {
    const newNode = {
      id: `${type}-${Date.now()}`,
      type: type,
      position: searchMenu.flowPos,
      data: { projectPath: projectPath },
      ...(type === 'imageNode' ? { width: 480, height: 270 } : {})
    };
    setNodes((nds) => nds.concat(newNode));
    setSearchMenu((prev) => ({ ...prev, show: false }));
  };

  // 🌟 从快捷悬浮底栏（Dock）添加节点并居中
  const addNodeFromDock = (type) => {
    const flowPos = screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });

    const newNode = {
      id: `${type}-${Date.now()}`,
      type: type,
      position: flowPos,
      data: { projectPath: projectPath },
      // 🌟 新增：同样的逻辑，给图片节点初始尺寸
    ...(type === 'imageNode' ? { width: 480, height: 270 } : {})
    };

    setNodes((nds) => nds.concat(newNode));
  };

  const onConnect = (params) => setEdges((eds) => addEdge({ ...params, type: 'default' }, eds));

  const handleEdgeClick = (event, clickedEdge) => {
    event.stopPropagation();
    setNodes((nds) => nds.map((node) => ({ ...node, selected: false })));
    setEdges((eds) =>
      eds.map((edge) => ({
        ...edge,
        selected: edge.id === clickedEdge.id,
      }))
    );
  };

  const handlePaneClick = () => {
    setSearchMenu((prev) => ({ ...prev, show: false }));
    setNodes((nds) => nds.map((node) => ({ ...node, selected: false })));
    setEdges((eds) => eds.map((edge) => ({ ...edge, selected: false })));
  };

  return (
    <div 
      style={{ width: '100vw', height: '100vh' }} 
      onDoubleClick={handleContainerDoubleClick} 
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleCanvasDrop}
      className="relative bg-[#0b0b0b]"
    >
      {/* 核心画布主渲染区 */}
      <ReactFlow 
        nodes={nodes} 
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onEdgeClick={handleEdgeClick}
        onConnect={onConnect}
        nodeTypes={nodeTypes} 
        edgeTypes={edgeTypes}
        isValidConnection={isValidConnection}
        zoomOnDoubleClick={false} 
        minZoom={0.05} // 缩放自由限制解除
        maxZoom={4}
        deleteKeyCode={['Backspace', 'Delete']} // 快捷键一键删除
        selectionMode="Partial" // 暗黑高级框选
        onPaneClick={handlePaneClick} 
        selectionMode="partial"
        onPaneClick={handlePaneClick}
      >
        <Background variant="dots" gap={20} size={1} color="#222" />
      </ReactFlow>

      {/* 3. Flora AI 极简暗黑风双击搜索面板 */}
      {searchMenu.show && (
        <div 
          style={{ top: `${searchMenu.y}px`, left: `${searchMenu.x}px` }} 
          onMouseDown={(e) => e.stopPropagation()}
          className="absolute z-[999] bg-[#141414] border border-white/5 rounded-[20px] p-3.5 w-[360px] shadow-[0_25px_60px_rgba(0,0,0,0.6)] animate-in fade-in zoom-in-95 duration-150 nodrag nopan"
        >
          <input
            type="text"
            autoFocus
            placeholder="Search nodes..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setSearchMenu({ ...searchMenu, show: false });
              if (e.key === 'Enter' && filteredNodes.length > 0) createNode(filteredNodes[0].type);
            }}
            className="w-full bg-white/5 border border-white/5 rounded-[12px] px-4 py-2.5 text-base text-white placeholder-white/20 focus:outline-none focus:border-white/10 mb-2 font-light tracking-wide"
          />
          
          <div className="max-h-64 overflow-y-auto pr-1">
            {filteredNodes.length > 0 ? (
              filteredNodes.map((node) => (
                <div
                  key={node.type}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    createNode(node.type);
                  }}
                  className="px-4 py-3 text-sm text-white/50 hover:text-white hover:bg-white/5 rounded-[10px] cursor-pointer transition-colors font-light flex items-center justify-between group"
                >
                  <span>{node.label}</span>
                  <span className="text-[10px] opacity-0 group-hover:opacity-30 transition-opacity font-mono">＋</span>
                </div>
              ))
            ) : (
              <div className="px-4 py-4 text-sm text-white/20 text-center font-light">No nodes found</div>
            )}
          </div>
        </div>
      )}

      {/* 4. Flora AI 极简高阶悬浮底栏 (Dock) */}
      <div 
        onMouseDown={(e) => e.stopPropagation()} 
        className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[99] bg-[#141414]/60 backdrop-blur-md border border-white/5 px-4 py-2 rounded-full flex items-center gap-2 shadow-[0_15px_40px_rgba(0,0,0,0.5)] select-none pointer-events-auto"
      >
        <button
          onClick={() => addNodeFromDock('textNode')}
          className="px-4 py-1.5 rounded-full text-xs text-white/50 hover:text-white hover:bg-white/5 transition-all cursor-pointer font-light flex items-center gap-2 active:scale-95 group"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500/60 group-hover:bg-blue-400 group-hover:shadow-[0_0_8px_rgba(96,165,250,0.6)] transition-all" />
          Prompt
        </button>

        <div className="w-[1px] h-3 bg-white/10" />

        <button
          onClick={() => addNodeFromDock('imageNode')}
          className="px-4 py-1.5 rounded-full text-xs text-white/50 hover:text-white hover:bg-white/5 transition-all cursor-pointer font-light flex items-center gap-2 active:scale-95 group"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-purple-500/60 group-hover:bg-purple-400 group-hover:shadow-[0_0_8px_rgba(192,132,252,0.6)] transition-all" />
          Image
        </button>
      </div>
    </div>
  );
}


export default function App() {
  const [projectPath, setProjectPath] = useState(null);
  const [projectData, setProjectData] = useState(null); // 新增：用于暂存初始数据

  const handleLaunch = (path, data) => {
    setProjectPath(path);
    setProjectData(data); // 🌟 记住 Launcher 传回来的数据
  };

  return (
    <ReactFlowProvider>
      {!projectPath ? (
        <Launcher onLaunch={handleLaunch} />
      ) : (
        // 🌟 将 projectData 传下去
        <FlowCanvas projectPath={projectPath} initialData={projectData} />
      )}
    </ReactFlowProvider>
  );
}
