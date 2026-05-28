import { useCallback, useEffect, useRef, useState } from 'react';
import { 
  ReactFlow, 
  Background, 
  MiniMap,
  ReactFlowProvider, 
  useReactFlow, 
  useNodesState, 
  useEdgesState,
  addEdge,
  applyEdgeChanges
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Launcher } from './components/Launcher';
import ImageEdge from './components/ImageEdge';
import { TopProjectBar } from './components/TopProjectBar';
import { ConnectionNodeMenu } from './components/ConnectionNodeMenu';
import { NodeDock } from './components/NodeDock';

import { TextNode } from './nodes/TextNode';
import { TextConstructionNode } from './nodes/TextConstructionNode';
import { LLMProcessorNode } from './nodes/LLMProcessorNode';
import { ImageNode } from './nodes/ImageNode';
import { VideoNode } from './nodes/VideoNode';
import { AudioInputNode } from './nodes/AudioInputNode';
import { ShotListNode } from './nodes/ShotListNode';
import { OmniComposerNode } from './nodes/OmniComposerNode';
import { ImageInputNode } from './nodes/ImageInputNode';
import { OutputNode } from './nodes/OutputNode';
import { SplitGridNode } from './nodes/SplitGridNode';
import { ImageCompareNode } from './nodes/ImageCompareNode';
import { RouteNode } from './nodes/RouteNode';
import { AR720Node } from './nodes/AR720Node';
import { Panorama360Node } from './nodes/Panorama360Node';
import { NODE_DEFINITIONS, createDefaultNodeData, getNodeDefinition } from './nodes/nodeDefinitions';
import {
  getCompatibleNodeDefinitions,
  getCompatibleTargetHandle,
  groupNodeDefinitionsByCategory,
} from './utils/nodeCompatibility';
import { useCanvasHistory } from './hooks/useCanvasHistory';
import { getImageNodeAspectRatio, getImageNodeSizeByAspectRatio, hasValidNodeSize } from './utils/nodeSizing';
import { saveProjectCore } from './utils/projectSave';
import { RUNNABLE_NODE_TYPES } from './utils/nodeCategories';
import { DISABLE_MINIMAP, ONLY_RENDER_VISIBLE_ELEMENTS } from './utils/perfDebug';
import { normalizeImageInputEdgeLabels } from './utils/edgeLabels';
import { uploadImageToInput } from './utils/uploadToInput';
import { useAppSettings } from './utils/appSettings';
//import { ButtonEdge } from './edges/ButtonEdge';

const nodeTypes = {
  textNode: TextNode,
  textConstruction: TextConstructionNode,
  imageNode: ImageNode,
  videoNode: VideoNode,
  audioInputNode: AudioInputNode,
  shotListNode: ShotListNode,
  omniComposerNode: OmniComposerNode,
  imageInputNode: ImageInputNode,
  outputNode: OutputNode,
  splitGridNode: SplitGridNode,
  imageCompareNode: ImageCompareNode,
  ar720Node: AR720Node,
  panorama360Node: Panorama360Node,
  routeNode: RouteNode,
  llmProcessor: LLMProcessorNode,
};

const edgeTypes = {
  default: ImageEdge, //default: ButtonEdge, 
};

const normalizeEdges = (edges = []) =>
  normalizeImageInputEdgeLabels(
    edges.map((edge) => ({
      ...edge,
      type: 'default',
    }))
  );

const getImageInputTargetIds = (edges = []) => {
  const targetIds = new Set();
  for (const edge of edges) {
    const targetHandle = edge.targetHandle ?? edge.targetHandleId;
    if (targetHandle === 'image:in') {
      targetIds.add(edge.target);
    }
  }
  return targetIds;
};

// 收集 image:a / image:b 各自有连接的节点 ID
const getImageCompareConnectedIds = (edges = []) => {
  const aIds = new Set();
  const bIds = new Set();
  for (const edge of edges) {
    const targetHandle = edge.targetHandle ?? edge.targetHandleId;
    if (targetHandle === 'image:a') aIds.add(edge.target);
    if (targetHandle === 'image:b') bIds.add(edge.target);
  }
  return { aIds, bIds };
};

const applyImageInputConnectionFlags = (nodes = [], edges = []) => {
  const imageInputTargetIds = getImageInputTargetIds(edges);
  const { aIds, bIds } = getImageCompareConnectedIds(edges);
  let changed = false;

  const nextNodes = nodes.map((node) => {
    // ---- imageInputNode：原有逻辑保持不变 ----
    if (node.type === 'imageInputNode') {
      const hasImageInputConnection = imageInputTargetIds.has(node.id);
      if (Boolean(node.data?.hasImageInputConnection) === hasImageInputConnection) {
        return node;
      }
      changed = true;
      return {
        ...node,
        data: {
          ...(node.data || {}),
          hasImageInputConnection,
        },
      };
    }

    // ---- splitGridNode / spatialPreviewNode (ar720Node / panorama360Node) ----
    if (
      node.type === 'splitGridNode' ||
      node.type === 'ar720Node' ||
      node.type === 'panorama360Node'
    ) {
      const hasImageInConnection = imageInputTargetIds.has(node.id);
      if (Boolean(node.data?.hasImageInConnection) === hasImageInConnection) {
        return node;
      }
      changed = true;
      return {
        ...node,
        data: {
          ...(node.data || {}),
          hasImageInConnection,
        },
      };
    }

    // ---- imageCompareNode：分别标记 A / B ----
    if (node.type === 'imageCompareNode') {
      const hasImageAConnection = aIds.has(node.id);
      const hasImageBConnection = bIds.has(node.id);
      if (
        Boolean(node.data?.hasImageAConnection) === hasImageAConnection &&
        Boolean(node.data?.hasImageBConnection) === hasImageBConnection
      ) {
        return node;
      }
      changed = true;
      return {
        ...node,
        data: {
          ...(node.data || {}),
          hasImageAConnection,
          hasImageBConnection,
        },
      };
    }

    return node;
  });

  return changed ? nextNodes : nodes;
};

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

    const defaultSize = getNodeDefinition(node.type)?.defaultSize;
    const sizePatch =
      (node.type === 'imageNode' || node.type === 'videoNode') && !hasValidNodeSize(node)
        ? getImageNodeSizeByAspectRatio(
            node.type === 'videoNode' ? data.aspectRatio || '16:9' : getImageNodeAspectRatio(data)
          )
        : !hasValidNodeSize(node) && defaultSize
          ? defaultSize
          : {};

    return {
      ...node,
      selected: false,
      dragging: false,
      data,
      position: node.position || { x: 0, y: 0 },
      ...sizePatch,
    };
  });

const isValidConnection = (c) => {
  if (!c.sourceHandle || !c.targetHandle) return false;
  return c.sourceHandle.split(':')[0] === c.targetHandle.split(':')[0];
};

const getEventPoint = (event) => {
  const touch = event?.changedTouches?.[0];
  if (touch) return { x: touch.clientX, y: touch.clientY };

  if (typeof event?.clientX === 'number' && typeof event?.clientY === 'number') {
    return { x: event.clientX, y: event.clientY };
  }

  return null;
};

const clampMenuPoint = (point, menuWidth = 260, menuHeight = 360, margin = 12) => ({
  x: Math.min(Math.max(point.x, margin), window.innerWidth - menuWidth - margin),
  y: Math.min(Math.max(point.y, margin), window.innerHeight - menuHeight - margin),
});

const getConnectionStateSource = (connectionState) => {
  const source =
    typeof connectionState?.fromNode === 'string'
      ? connectionState.fromNode
      : connectionState?.fromNode?.id;

  const sourceHandle =
    typeof connectionState?.fromHandle === 'string'
      ? connectionState.fromHandle
      : connectionState?.fromHandle?.id || connectionState?.fromHandle?.handleId;

  const handleType =
    connectionState?.fromHandle?.type ||
    connectionState?.fromHandle?.handleType ||
    connectionState?.fromHandle?.handle_type;

  const isSource =
    handleType === 'source' ||
    sourceHandle?.endsWith(':out') ||
    sourceHandle === 'image:out' ||
    sourceHandle === 'text:out';

  return source && sourceHandle && isSource ? { source, sourceHandle } : null;
};

const isEditableShortcutTarget = (target) => {
  const tagName = target?.tagName?.toLowerCase();
  return tagName === 'input' || tagName === 'textarea' || Boolean(target?.isContentEditable);
};

function FlowCanvas({ projectPath, projectFilePath, projectName, initialData }) {
  const [nodes, setNodes, onNodesChange] = useNodesState(normalizeNodesForLoad(initialData?.nodes || []));
  const [edges, setEdges] = useEdgesState(normalizeEdges(initialData?.edges || []));
  const [saveStatus, setSaveStatus] = useState('idle');
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [isMiniMapCollapsed, setIsMiniMapCollapsed] = useState(false);
  const [isDraggingNode, setIsDraggingNode] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState('developer');
  const [appSettings, updateAppSetting] = useAppSettings();
  const isSavingRef = useRef(false);
  const latestCanvasRef = useRef({ nodes: [], edges: [] });
  const latestProjectRef = useRef({ projectPath, projectFilePath, projectName });
  const pendingConnectionRef = useRef(null);
  const connectionSuccessfulRef = useRef(false);
  const { commitHistory, undo, redo } = useCanvasHistory({
    nodes,
    edges,
    setNodes,
    setEdges,
    maxHistory: 50,
  });

  //
  useEffect(() => {
    if (initialData && Array.isArray(initialData.nodes)) {
      const sanitizedNodes = normalizeNodesForLoad(initialData.nodes);
      const sanitizedEdges = normalizeEdges(initialData.edges || []);
      setNodes(applyImageInputConnectionFlags(sanitizedNodes, sanitizedEdges));
      setEdges(sanitizedEdges);
    }
  }, [initialData, setNodes, setEdges]);

  const { screenToFlowPosition } = useReactFlow();

  const onEdgesChange = useCallback(
    (changes) => {
      setEdges((currentEdges) => normalizeImageInputEdgeLabels(applyEdgeChanges(changes, currentEdges)));
    },
    [setEdges]
  );

  useEffect(() => {
    setNodes((currentNodes) => applyImageInputConnectionFlags(currentNodes, edges));
  }, [edges, setNodes]);

  useEffect(() => {
    latestCanvasRef.current = { nodes, edges };
  }, [nodes, edges]);

  useEffect(() => {
    latestProjectRef.current = { projectPath, projectFilePath, projectName };
  }, [projectPath, projectFilePath, projectName]);

  //
  useEffect(() => {
    const loadProject = async () => {
      const res = await fetch('http://127.0.0.1:8000/api/project/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: projectPath })
      });
      const result = await res.json();
      if (result.status === 'success' && result.data) {
        const nextEdges = normalizeEdges(result.data.edges || []);
        setNodes(applyImageInputConnectionFlags(normalizeNodesForLoad(result.data.nodes), nextEdges));
        setEdges(nextEdges);
      }
    };
    if (projectPath && !initialData) loadProject();
  }, [projectPath, initialData, setNodes, setEdges]);

  //
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
    if (!projectPath) return undefined;

    const saveLatestCanvas = async () => {
      const { nodes: latestNodes, edges: latestEdges } = latestCanvasRef.current;
      const {
        projectPath: latestProjectPath,
        projectFilePath: latestProjectFilePath,
        projectName: latestProjectName,
      } = latestProjectRef.current;

      if (!latestProjectPath || latestNodes.length === 0 || isSavingRef.current) return;

      isSavingRef.current = true;
      setSaveStatus('saving');

      const result = await saveProjectCore({
        projectPath: latestProjectPath,
        projectFilePath: latestProjectFilePath,
        projectName: latestProjectName,
        nodes: latestNodes,
        edges: latestEdges,
        reason: 'interval-auto-save',
      });

      isSavingRef.current = false;

      if (result.ok) {
        setLastSavedAt(result.savedAt);
        setSaveStatus('saved');
      } else {
        console.error('[project:auto-save failed]', result.error);
        setSaveStatus('error');
      }
    };

    const interval = window.setInterval(saveLatestCanvas, 60_000);
    return () => window.clearInterval(interval);
  }, [projectPath]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (!(event.ctrlKey || event.metaKey) || isEditableShortcutTarget(event.target)) return;

      const key = event.key.toLowerCase();

      if (key === 'z' && event.shiftKey) {
        event.preventDefault();
        redo();
        return;
      }

      if (key === 'z') {
        event.preventDefault();
        undo();
        return;
      }

      if (key === 'y') {
        event.preventDefault();
        redo();
        return;
      }

      if (key === 's') {
        event.preventDefault();
        saveProject('shortcut');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [redo, saveProject, undo]);

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
  const [connectionMenu, setConnectionMenu] = useState(null);
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

        if (!projectPath) {
          console.error('[App] projectPath not available for paste');
          return;
        }

        const flowPos = screenToFlowPosition({
          x: window.innerWidth / 2,
          y: window.innerHeight / 2,
        });

        let finalImageUrl = targetUrl;
        let imageMetadata = {};

        // Upload file to input directory
        if (targetFile) {
          try {
            const result = await uploadImageToInput(targetFile, {
              projectPath,
              sourceKind: 'paste',
              filename: targetFile.name,
              mimeType: targetFile.type,
            });
            finalImageUrl = result.url;
            imageMetadata = {
              filename: result.filename,
              mimeType: result.mimeType,
              width: result.width,
              height: result.height,
              bytes: result.bytes,
            };
          } catch (error) {
            console.error('[App] Paste upload failed:', error);
            return;
          }
        }

        const newNode = {
          id: `imageInputNode-${Date.now()}`,
          type: 'imageInputNode',
          position: flowPos,
          data: {
            url: finalImageUrl,
            sourceKind: targetFile ? 'paste' : 'url',
            projectPath,
            ...imageMetadata,
          },
        };

        const nextNodes = nodes.concat(newNode);
        setNodes(nextNodes);
        commitHistory(nextNodes, edges);
      }
    };

    window.addEventListener('paste', handleCanvasPaste);
    return () => window.removeEventListener('paste', handleCanvasPaste);
  }, [commitHistory, edges, nodes, screenToFlowPosition, setNodes, projectPath]);
  

  // --- 馃専 2. 澶栭儴鏂囦欢澶瑰浘鍍忔嫋鍔ㄩ噴鏀撅紙Drop锛夊搷搴斿櫒 ---
  const handleCanvasDrop = async (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];

    if (!file || !file.type.startsWith('image/')) return;

    if (!projectPath) {
      console.error('[App] projectPath not available for drop');
      return;
    }

    try {
      const result = await uploadImageToInput(file, {
        projectPath,
        sourceKind: 'drop',
        filename: file.name,
        mimeType: file.type,
      });

      const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY });

      const newNode = {
        id: `imageInputNode-${Date.now()}`,
        type: 'imageInputNode',
        position: flowPos,
        data: {
          url: result.url,
          filename: result.filename,
          mimeType: result.mimeType,
          width: result.width,
          height: result.height,
          bytes: result.bytes,
          sourceKind: 'drop',
          projectPath,
        },
      };
      const nextNodes = nodes.concat(newNode);
      setNodes(nextNodes);
      commitHistory(nextNodes, edges);
    } catch (error) {
      console.error('[App] Drop upload failed:', error);
    }
  };

  // 澶勭悊鍙屽嚮鍞よ捣鎼滅储闈㈡澘
  const handleContainerDoubleClick = (e) => {
    if (e.target.closest('.react-flow__node') || e.target.closest('.nodrag')) return;
    const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    setSearchMenu({ show: true, x: e.clientX, y: e.clientY, flowPos });
    setConnectionMenu(null);
    setQuery('');
  };

  const buildNode = useCallback((type, position) => {
    const data = createDefaultNodeData(type, projectPath);
    const size =
      type === 'imageNode'
        ? getImageNodeSizeByAspectRatio(getImageNodeAspectRatio(data))
        : type === 'videoNode'
          ? getImageNodeSizeByAspectRatio(data.aspectRatio || '16:9')
          : getNodeDefinition(type)?.defaultSize || {};

    return {
      id: `${type}-${Date.now()}`,
      type: type,
      position,
      data,
      ...size,
    };
  }, [projectPath]);

  const createNode = (type) => {
    const newNode = buildNode(type, searchMenu.flowPos);
    const nextNodes = nodes.concat(newNode);
    setNodes(nextNodes);
    commitHistory(nextNodes, edges);
    setSearchMenu((prev) => ({ ...prev, show: false }));
  };

  // 馃専 浠庡揩鎹锋偓娴簳鏍忥紙Dock锛夋坊鍔犺妭鐐瑰苟灞呬腑
  const addNodeFromDock = (type) => {
    const flowPos = screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });

    const newNode = buildNode(type, flowPos);

    const nextNodes = nodes.concat(newNode);
    setNodes(nextNodes);
    commitHistory(nextNodes, edges);
  };

  const selectedRunnableNode = nodes.find(
    (node) => node.selected && RUNNABLE_NODE_TYPES.has(node.type)
  );

  const handleRunSelected = useCallback(() => {
    if (!selectedRunnableNode) return;

    const runRequestId = Date.now();
    setNodes((nds) =>
      nds.map((node) =>
        node.id === selectedRunnableNode.id
          ? {
              ...node,
              data: {
                ...node.data,
                runRequestId,
              },
            }
          : node
      )
    );
  }, [selectedRunnableNode, setNodes]);

  const onConnect = (params) => {
    connectionSuccessfulRef.current = true;
    const nextEdges = normalizeImageInputEdgeLabels(addEdge({ ...params, type: 'default' }, edges));
    setEdges(nextEdges);
    commitHistory(nodes, nextEdges);
  };

  const handleConnectStart = (event, params) => {
    setConnectionMenu(null);
    connectionSuccessfulRef.current = false;

    const nodeId = params?.nodeId;
    const handleId = params?.handleId;
    const handleType = params?.handleType;

    const isSource =
      handleType === 'source' ||
      handleId?.endsWith(':out') ||
      handleId === 'image:out' ||
      handleId === 'text:out';

    if (!nodeId || !handleId || !isSource) {
      pendingConnectionRef.current = null;
      return;
    }

    pendingConnectionRef.current = {
      source: nodeId,
      sourceHandle: handleId,
    };
  };

  const handleConnectEnd = (event, connectionState) => {
    if (connectionSuccessfulRef.current) {
      pendingConnectionRef.current = null;
      connectionSuccessfulRef.current = false;
      return;
    }

    const pending = pendingConnectionRef.current || getConnectionStateSource(connectionState);
    pendingConnectionRef.current = null;
    connectionSuccessfulRef.current = false;

    if (!pending?.source || !pending?.sourceHandle) {
      return;
    }

    const point = getEventPoint(event);
    if (!point) {
      return;
    }

    const compatibleDefinitions = getCompatibleNodeDefinitions(pending.sourceHandle);
    const groupedItems = groupNodeDefinitionsByCategory(compatibleDefinitions);
    const flowPos = screenToFlowPosition(point);
    const menuPoint = clampMenuPoint(point);

    setSearchMenu((prev) => ({ ...prev, show: false }));
    setTimeout(() => {
      setConnectionMenu({
        x: menuPoint.x,
        y: menuPoint.y,
        flowPos,
        source: pending.source,
        sourceHandle: pending.sourceHandle,
        groupedItems,
      });
    }, 0);
  };

  const createNodeFromConnection = (type) => {
    if (!connectionMenu) return;

    const targetHandle = getCompatibleTargetHandle(type, connectionMenu.sourceHandle);
    if (!targetHandle) {
      setConnectionMenu(null);
      return;
    }

    const newNode = buildNode(type, connectionMenu.flowPos);
    if (type === 'splitGridNode') {
      newNode.data = {
        ...newNode.data,
        settingsOpen: true,
      };
    }
    const nextNodes = nodes.concat(newNode);
    const nextEdges = normalizeImageInputEdgeLabels(addEdge(
      {
        id: `${connectionMenu.source}-${connectionMenu.sourceHandle}-${newNode.id}-${targetHandle}`,
        source: connectionMenu.source,
        sourceHandle: connectionMenu.sourceHandle,
        target: newNode.id,
        targetHandle,
        type: 'default',
      },
      edges
    ));

    setNodes(nextNodes);
    setEdges(nextEdges);
    commitHistory(nextNodes, nextEdges);
    setConnectionMenu(null);
  };

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
    setConnectionMenu(null);
    setNodes((nds) => nds.map((node) => ({ ...node, selected: false })));
    setEdges((eds) => eds.map((edge) => ({ ...edge, selected: false })));
  };

  return (
    <div 
      style={{ width: '100vw', height: '100vh' }} 
      onDoubleClick={handleContainerDoubleClick} 
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleCanvasDrop}
      className={`relative bg-[#0b0b0b] ${isDraggingNode ? 'is-node-dragging' : ''}`}
    >
      {/* 鏍稿績鐢诲竷涓绘覆鏌撳尯 */}
      <TopProjectBar
        projectName={projectName}
        saveStatus={saveStatus}
        lastSavedAt={lastSavedAt}
        onSave={() => saveProject('manual')}
      />

      <div
        className="nodrag nopan absolute right-6 top-6 z-[80]"
        onMouseDown={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        onWheel={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => setSettingsOpen((value) => !value)}
          className={`flex h-10 w-10 items-center justify-center rounded-full border text-white/60 shadow-[0_18px_40px_rgba(0,0,0,0.35)] backdrop-blur-xl transition-all hover:border-white/20 hover:bg-[#181818]/90 hover:text-white/85 ${
            settingsOpen ? 'border-white/25 bg-[#181818]/90 text-white' : 'border-white/10 bg-[#121212]/75'
          }`}
          aria-label="Settings"
          title="Settings"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.4 15a1.8 1.8 0 0 0 .36 1.98l.05.05a2.1 2.1 0 1 1-2.97 2.97l-.05-.05a1.8 1.8 0 0 0-1.98-.36 1.8 1.8 0 0 0-1.1 1.66V21.4a2.1 2.1 0 1 1-4.2 0v-.07a1.8 1.8 0 0 0-1.1-1.66 1.8 1.8 0 0 0-1.98.36l-.05.05a2.1 2.1 0 1 1-2.97-2.97l.05-.05A1.8 1.8 0 0 0 3.8 15a1.8 1.8 0 0 0-1.66-1.1H2.1a2.1 2.1 0 1 1 0-4.2h.07a1.8 1.8 0 0 0 1.66-1.1 1.8 1.8 0 0 0-.36-1.98l-.05-.05A2.1 2.1 0 1 1 6.4 3.6l.05.05a1.8 1.8 0 0 0 1.98.36 1.8 1.8 0 0 0 1.1-1.66V2.1a2.1 2.1 0 1 1 4.2 0v.07a1.8 1.8 0 0 0 1.1 1.66 1.8 1.8 0 0 0 1.98-.36l.05-.05a2.1 2.1 0 1 1 2.97 2.97l-.05.05a1.8 1.8 0 0 0-.36 1.98 1.8 1.8 0 0 0 1.66 1.1h.07a2.1 2.1 0 1 1 0 4.2h-.07A1.8 1.8 0 0 0 19.4 15Z" />
          </svg>
        </button>

        {settingsOpen && (
          <div className="absolute right-0 mt-3 w-[360px] overflow-hidden rounded-[22px] border border-white/10 bg-[#141414]/90 shadow-[0_28px_70px_rgba(0,0,0,0.58)] backdrop-blur-2xl">
            <div className="flex items-center justify-between border-b border-white/5 px-5 py-4">
              <div className="text-sm font-light tracking-[0.08em] text-white/80">Settings</div>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="rounded-full px-2 py-1 text-xs text-white/35 transition-colors hover:bg-white/5 hover:text-white/70"
              >
                Esc
              </button>
            </div>

            <div className="flex gap-1 border-b border-white/5 px-3 py-2">
              {[
                { id: 'general', label: 'General' },
                { id: 'developer', label: 'Developer' },
              ].map((tab) => (
                <button
                  type="button"
                  key={tab.id}
                  onClick={() => setSettingsTab(tab.id)}
                  className={`rounded-full px-3 py-1.5 text-xs transition-colors ${
                    settingsTab === tab.id
                      ? 'bg-white/10 text-white/85'
                      : 'text-white/35 hover:bg-white/5 hover:text-white/65'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="p-4">
              {settingsTab === 'developer' ? (
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-sm font-light text-white/80">Show Raw Custom Params</div>
                      <div className="mt-1 text-xs leading-5 text-white/35">
                        Show provider-specific raw JSON parameters in video nodes for debugging.
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => updateAppSetting('showRawCustomParams', !appSettings.showRawCustomParams)}
                      className={`mt-0.5 h-7 w-12 shrink-0 rounded-full border p-0.5 transition-colors ${
                        appSettings.showRawCustomParams ? 'border-white/55 bg-white/85' : 'border-white/10 bg-black/30'
                      }`}
                      aria-pressed={appSettings.showRawCustomParams}
                    >
                      <span
                        className={`block h-5 w-5 rounded-full transition-transform ${
                          appSettings.showRawCustomParams ? 'translate-x-5 bg-black' : 'translate-x-0 bg-white/35'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-5 text-sm font-light text-white/35">
                  General settings will appear here.
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <ReactFlow 
        nodes={nodes} 
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onEdgeClick={handleEdgeClick}
        onConnect={onConnect}
        onConnectStart={handleConnectStart}
        onConnectEnd={handleConnectEnd}
        onNodeDragStart={() => setIsDraggingNode(true)}
        onNodeDragStop={() => setIsDraggingNode(false)}
        nodeTypes={nodeTypes} 
        edgeTypes={edgeTypes}
        isValidConnection={isValidConnection}
        zoomOnDoubleClick={false} 
        minZoom={0.05} // 缂╂斁鑷敱闄愬埗瑙ｉ櫎
        maxZoom={4}
        deleteKeyCode={['Backspace', 'Delete']} // 蹇嵎閿竴閿垹闄?        selectionMode="Partial" // 鏆楅粦楂樼骇妗嗛€?        onPaneClick={handlePaneClick} 
        selectionMode="partial"
        onPaneClick={handlePaneClick}
        onlyRenderVisibleElements={ONLY_RENDER_VISIBLE_ELEMENTS}
      >
        <Background variant="dots" gap={20} size={1} color="#222" />
        {!DISABLE_MINIMAP && !isMiniMapCollapsed && (
          <MiniMap
            pannable
            zoomable
            nodeColor={() => 'rgba(255,255,255,0.32)'}
            nodeStrokeColor={() => 'rgba(255,255,255,0.12)'}
            maskColor="rgba(255,255,255,0.08)"
          />
        )}
      </ReactFlow>

      <button
        type="button"
        onClick={() => setIsMiniMapCollapsed((value) => !value)}
        className={`nodrag nopan absolute right-6 z-30 border border-white/10 bg-[#121212]/75 text-[10px] font-light uppercase tracking-[0.16em] text-white/55 shadow-[0_18px_40px_rgba(0,0,0,0.35)] backdrop-blur-xl transition-all hover:border-white/20 hover:bg-[#181818]/90 hover:text-white/80 ${
          isMiniMapCollapsed
            ? 'bottom-6 h-10 w-10 rounded-full'
            : 'bottom-[166px] rounded-full px-3 py-2'
        }`}
        aria-label={isMiniMapCollapsed ? 'Show minimap' : 'Hide minimap'}
        title={isMiniMapCollapsed ? 'Show minimap' : 'Hide minimap'}
      >
        {isMiniMapCollapsed ? 'Map' : 'Hide map'}
      </button>

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

      {connectionMenu && (
        <ConnectionNodeMenu
          x={connectionMenu.x}
          y={connectionMenu.y}
          groupedItems={connectionMenu.groupedItems}
          onSelect={createNodeFromConnection}
          onClose={() => setConnectionMenu(null)}
        />
      )}

      {/* 4. Flora AI 鏋佺畝楂橀樁鎮诞搴曟爮 (Dock) */}
      <NodeDock
        onCreateNode={addNodeFromDock}
        onRunSelected={handleRunSelected}
        selectedRunnableNode={selectedRunnableNode}
      />
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
