import { useCallback, useEffect, useRef, useState } from 'react';
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
import { TopProjectBar } from './components/TopProjectBar';

import { TextNode } from './nodes/TextNode';
import { TextConstructionNode } from './nodes/TextConstructionNode';
import { ImageNode } from './nodes/ImageNode';
import { ImageInputNode } from './nodes/ImageInputNode';
import { NODE_DEFINITIONS, createDefaultNodeData, getNodeDefinition } from './nodes/nodeDefinitions';
import { getImageNodeAspectRatio, getImageNodeSizeByAspectRatio, hasValidNodeSize } from './utils/nodeSizing';
import { describeImageValue, saveProjectCore } from './utils/projectSave';
//import { ButtonEdge } from './edges/ButtonEdge';

const nodeTypes = {
  textNode: TextNode,
  textConstruction: TextConstructionNode,
  imageNode: ImageNode,
  imageInputNode: ImageInputNode,
};

const edgeTypes = {
  default: ImageEdge, //default: ButtonEdge, 
};

const normalizeEdges = (edges = []) =>
  edges.map((edge) => ({
    ...edge,
    type: 'default',
  }));

const fileToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const normalizeNodesForLoad = (nodes = []) =>
  nodes.map((node) => {
    const data = { ...(node.data || {}) };
    const persistentImage = data.dataUrl || data.imageUrl || data.src;

    if (node.type === 'imageInputNode' && !data.url && persistentImage) {
      data.url = persistentImage;
    }

    if (node.type === 'textNode') {
      data.text = data.text ?? data.content ?? data.value ?? data.prompt ?? '';
      data.variableName = data.variableName || '';
    }

    if (node.type === 'textConstruction') {
      data.template = data.template ?? data.text ?? '';
    }

    const sizePatch =
      node.type === 'imageNode' && !hasValidNodeSize(node)
        ? getImageNodeSizeByAspectRatio(getImageNodeAspectRatio(data))
        : {};

    console.log('[project:load node image]', {
      nodeId: node.id,
      type: node.type,
      imageFields: {
        url: describeImageValue(data.url),
        dataUrl: describeImageValue(data.dataUrl),
        imageUrl: describeImageValue(data.imageUrl),
        src: describeImageValue(data.src),
      },
    });

    return {
      ...node,
      selected: false,
      dragging: false,
      data,
      position: node.position || { x: 0, y: 0 },
      ...sizePatch,
    };
  });

function Flow() {
  return (
    <ReactFlow 
      nodes={nodes} 
      edges={edges}
      edgeTypes={edgeTypes} // 馃専 娉ㄥ唽
      // ...
    />
  );
}

// 鍒濆蹇収鏁版嵁
const initialNodes = [
  { id: '1', type: 'textNode', position: { x: 100, y: 150 }, data: {} },
  { id: '2', type: 'imageNode', position: { x: 520, y: 150 }, data: {}, width:480, height:270 },
];

const initialEdges = [
  { id: 'e1-2', source: '1', target: '2', sourceHandle: 'text:out', targetHandle: 'text:prompt' }
];

const isValidConnection = (c) => {
  if (!c.sourceHandle || !c.targetHandle) return false;
  return c.sourceHandle.split(':')[0] === c.targetHandle.split(':')[0];
};

function FlowCanvas({ projectPath, projectFilePath, projectName, initialData }) {
  const [nodes, setNodes, onNodesChange] = useNodesState(normalizeNodesForLoad(initialData?.nodes || []));
  const [edges, setEdges, onEdgesChange] = useEdgesState(normalizeEdges(initialData?.edges || []));
  const [saveStatus, setSaveStatus] = useState('idle');
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const isSavingRef = useRef(false);

  // 馃専 鏂板锛氬鏋?initialData 鍙樹簡锛堟瘮濡傞€氳繃 Launcher 鍔犺浇浜嗘柊椤圭洰锛夛紝寮哄埗鏇存柊鐢诲竷
  useEffect(() => {
    if (initialData && Array.isArray(initialData.nodes)) {
      const sanitizedNodes = normalizeNodesForLoad(initialData.nodes);
      setNodes(sanitizedNodes);
      setEdges(normalizeEdges(initialData.edges || []));
    }
  }, [initialData, setNodes, setEdges]);

  const { screenToFlowPosition } = useReactFlow();

  // 馃専 鎼縼浣嶇疆锛氬湪姝ゅ鎻掑叆鏂板 A (鍔犺浇椤圭洰)
  useEffect(() => {
    const loadProject = async () => {
      const res = await fetch('http://127.0.0.1:8000/api/project/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: projectPath })
      });
      const result = await res.json();
      if (result.status === 'success' && result.data) {
        setNodes(normalizeNodesForLoad(result.data.nodes));
        if (result.data.edges) setEdges(normalizeEdges(result.data.edges));
      }
    };
    if (projectPath && !initialData) loadProject();
  }, [projectPath, initialData, setNodes, setEdges]);

  // 馃専 鎼縼浣嶇疆锛氬湪姝ゅ鎻掑叆鏂板 B (鑷姩淇濆瓨)
  const saveProject = useCallback(
    async (reason = 'manual') => {
      if (!projectPath || nodes.length === 0 || isSavingRef.current) return { ok: false };

      isSavingRef.current = true;
      setSaveStatus('saving');

      const result = await saveProjectCore({
        projectPath,
        projectFilePath,
        projectName,
        nodes,
        edges,
        reason,
      });

      isSavingRef.current = false;

      if (result.ok) {
        setLastSavedAt(result.savedAt);
        setSaveStatus('saved');
      } else {
        console.error('[project:save failed]', result.error);
        setSaveStatus('error');
      }

      return result;
    },
    [projectPath, projectFilePath, projectName, nodes, edges]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      saveProject('auto');
    }, 1500);
    return () => clearTimeout(timer);
  }, [saveProject]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        saveProject('shortcut');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [saveProject]);

  // 馃専 灏嗚ˉ涓佹斁鍦ㄨ繖閲岋細
  useEffect(() => {
    if (projectPath) {
      window.currentProjectPath = projectPath;
      
      setNodes((nds) =>
        nds.map((node) => ({
          ...node,
          data: { ...node.data, projectPath: projectPath }
        }))
      );
    }
  }, [projectPath, setNodes]);

  const [searchMenu, setSearchMenu] = useState({ show: false, x: 0, y: 0, flowPos: { x: 0, y: 0 } });
  const [query, setQuery] = useState('');

  const availableNodes = NODE_DEFINITIONS;

  const filteredNodes = availableNodes.filter(node => 
    `${node.label} ${node.description || ''}`.toLowerCase().includes(query.toLowerCase())
  );

  // --- 馃専 1. 鍏ㄥ眬鍓创鏉垮浘鐗囩矘璐达紙Paste锛夊叏鍦烘櫙閫氭潃鍝嶅簲鍣?---
  useEffect(() => {
    const handleCanvasPaste = async (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      const clipboardData = e.clipboardData;
      if (!clipboardData) return;

      let targetFile = null;
      let targetUrl = null;

      // 銆愯建閬?A銆戜紭鍏堟娴嬫爣鍑嗙殑鐗╃悊 files 闆嗗悎
      const files = clipboardData.files;
      if (files && files.length > 0) {
        for (let i = 0; i < files.length; i++) {
          if (files[i].type.startsWith('image/')) {
            targetFile = files[i];
            break;
          }
        }
      }

      // 銆愯建閬?B銆戦檷绾ф壂鎻?items 瀹炰綋闂寘
      if (!targetFile) {
        const items = clipboardData.items || [];
        for (let i = 0; i < items.length; i++) {
          if (items[i].type.startsWith('image/')) {
            targetFile = items[i].getAsFile();
            break;
          }
        }
      }

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

        const finalImageUrl = targetUrl ? targetUrl : await fileToDataUrl(targetFile);

        const newNode = {
          id: `imageInputNode-${Date.now()}`,
          type: 'imageInputNode',
          position: flowPos,
          data: {
            url: finalImageUrl,
            ...(finalImageUrl.startsWith('data:image/') ? { dataUrl: finalImageUrl } : {}),
            filename: targetFile?.name,
            mimeType: targetFile?.type,
          },
        };

        setNodes((nds) => nds.concat(newNode));
      }
    };

    window.addEventListener('paste', handleCanvasPaste);
    return () => window.removeEventListener('paste', handleCanvasPaste);
  }, [screenToFlowPosition, setNodes]);
  

  // --- 馃専 2. 澶栭儴鏂囦欢澶瑰浘鍍忔嫋鍔ㄩ噴鏀撅紙Drop锛夊搷搴斿櫒 ---
  const handleCanvasDrop = async (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    
    if (file && file.type.startsWith('image/')) {
      const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const dataUrl = await fileToDataUrl(file);
      
      const newNode = {
        id: `imageInputNode-${Date.now()}`,
        type: 'imageInputNode',
        position: flowPos,
        data: {
          url: dataUrl,
          dataUrl,
          filename: file.name,
          mimeType: file.type,
        },
      };
      setNodes((nds) => nds.concat(newNode));
    }
  };

  // 澶勭悊鍙屽嚮鍞よ捣鎼滅储闈㈡澘
  const handleContainerDoubleClick = (e) => {
    if (e.target.closest('.react-flow__node') || e.target.closest('.nodrag')) return;
    const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    setSearchMenu({ show: true, x: e.clientX, y: e.clientY, flowPos });
    setQuery('');
  };

  const createNode = (type) => {
    const data = createDefaultNodeData(type, projectPath);
    const size =
      type === 'imageNode'
        ? getImageNodeSizeByAspectRatio(getImageNodeAspectRatio(data))
        : getNodeDefinition(type)?.defaultSize || {};

    const newNode = {
      id: `${type}-${Date.now()}`,
      type: type,
      position: searchMenu.flowPos,
      data,
      ...size,
    };
    setNodes((nds) => nds.concat(newNode));
    setSearchMenu((prev) => ({ ...prev, show: false }));
  };

  // 馃専 浠庡揩鎹锋偓娴簳鏍忥紙Dock锛夋坊鍔犺妭鐐瑰苟灞呬腑
  const addNodeFromDock = (type) => {
    const flowPos = screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });

    const data = createDefaultNodeData(type, projectPath);
    const size =
      type === 'imageNode'
        ? getImageNodeSizeByAspectRatio(getImageNodeAspectRatio(data))
        : getNodeDefinition(type)?.defaultSize || {};

    const newNode = {
      id: `${type}-${Date.now()}`,
      type: type,
      position: flowPos,
      data,
      ...size,
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
      {/* 鏍稿績鐢诲竷涓绘覆鏌撳尯 */}
      <TopProjectBar
        projectName={projectName}
        saveStatus={saveStatus}
        lastSavedAt={lastSavedAt}
        onSave={() => saveProject('manual')}
      />

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
        minZoom={0.05} // 缂╂斁鑷敱闄愬埗瑙ｉ櫎
        maxZoom={4}
        deleteKeyCode={['Backspace', 'Delete']} // 蹇嵎閿竴閿垹闄?        selectionMode="Partial" // 鏆楅粦楂樼骇妗嗛€?        onPaneClick={handlePaneClick} 
        selectionMode="partial"
        onPaneClick={handlePaneClick}
      >
        <Background variant="dots" gap={20} size={1} color="#222" />
      </ReactFlow>

      {/* 3. Flora AI 鏋佺畝鏆楅粦椋庡弻鍑绘悳绱㈤潰鏉?*/}
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
                  <span className="text-[10px] opacity-0 group-hover:opacity-30 transition-opacity font-mono">&gt;</span>
                </div>
              ))
            ) : (
              <div className="px-4 py-4 text-sm text-white/20 text-center font-light">No nodes found</div>
            )}
          </div>
        </div>
      )}

      {/* 4. Flora AI 鏋佺畝楂橀樁鎮诞搴曟爮 (Dock) */}
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
          onClick={() => addNodeFromDock('textConstruction')}
          className="px-4 py-1.5 rounded-full text-xs text-white/50 hover:text-white hover:bg-white/5 transition-all cursor-pointer font-light flex items-center gap-2 active:scale-95 group"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-white/30 group-hover:bg-white/70 group-hover:shadow-[0_0_8px_rgba(255,255,255,0.35)] transition-all" />
          Construct
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
  const [projectFilePath, setProjectFilePath] = useState(null);
  const [projectName, setProjectName] = useState('Untitled Project');
  const [projectData, setProjectData] = useState(null);

  const handleLaunch = (path, data, filePath = null) => {
    const fileName = filePath?.split(/[\\/]/).filter(Boolean).pop()?.replace(/\.json$/i, '');
    setProjectPath(path);
    setProjectFilePath(filePath);
    setProjectName(fileName || data?.projectName || path?.split(/[\\/]/).filter(Boolean).pop() || 'Untitled Project');
    setProjectData(data);
  };

  return (
    <ReactFlowProvider>
      {!projectPath ? (
        <Launcher onLaunch={handleLaunch} />
      ) : (
        <FlowCanvas
          projectPath={projectPath}
          projectFilePath={projectFilePath}
          projectName={projectName}
          initialData={projectData}
        />
      )}
    </ReactFlowProvider>
  );
}
