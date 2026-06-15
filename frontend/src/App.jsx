import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { GroupsOverlay } from './components/GroupsOverlay';
import { SettingsModal } from './components/settings/SettingsModal';

import { TextNode } from './nodes/TextNode';
import { TextConstructionNode } from './nodes/TextConstructionNode';
import { LLMProcessorNode } from './nodes/LLMProcessorNode';
import { ImageNode } from './nodes/ImageNode';
import { VideoNode } from './nodes/VideoNode';
import { VideoInputNode } from './nodes/VideoInputNode';
import { EaseCurveNode } from './nodes/EaseCurveNode';
import { AudioInputNode } from './nodes/AudioInputNode';
import { ShotListNode } from './nodes/ShotListNode';
import { OmniComposerNode } from './nodes/OmniComposerNode';
import { ImageInputNode } from './nodes/ImageInputNode';
import { OutputNode } from './nodes/OutputNode';
import { SplitGridNode } from './nodes/SplitGridNode';
import { ImageCompareNode } from './nodes/ImageCompareNode';
import { AnnotateNode } from './nodes/AnnotateNode';
import { RouteNode } from './nodes/RouteNode';
import { AR720Node } from './nodes/AR720Node';
import { Panorama360Node } from './nodes/Panorama360Node';
import { NODE_DEFINITIONS, createDefaultNodeData, getNodeDefinition, getNodeDefinitionText } from './nodes/nodeDefinitions';
import { DEFAULT_EASE_CURVE_DATA, normalizeEasingPresetId } from './lib/easingPresets';
import { normalizeBezierHandles } from './lib/easingFunctions';
import {
  getCompatibleNodeDefinitions,
  getCompatibleTargetHandle,
  groupNodeDefinitionsByCategory,
} from './utils/nodeCompatibility';
import { useCanvasHistory } from './hooks/useCanvasHistory';
import {
  DEFAULT_VIDEO_INPUT_ASPECT_RATIO,
  getImageNodeAspectRatio,
  getImageNodeSizeByAspectRatio,
  getVideoInputNodeAspectRatio,
  getVideoInputNodeSizeByAspectRatio,
  hasValidNodeSize,
} from './utils/nodeSizing';
import { saveProjectCore } from './utils/projectSave';
import {
  assignNodeToContainingGroupState,
  createGroupState,
  deleteGroupState,
  moveGroupState,
  reconcileGroupsForLoad,
  removeNodesFromGroupState,
  resizeGroupState,
  updateGroupState,
} from './utils/groupBoxes';
import { RUNNABLE_NODE_TYPES } from './utils/nodeCategories';
import { DISABLE_MINIMAP, ONLY_RENDER_VISIBLE_ELEMENTS } from './utils/perfDebug';
import { normalizeImageInputEdgeLabels } from './utils/edgeLabels';
import { uploadImageToInput } from './utils/uploadToInput';
import { useAppSettings } from './utils/appSettings';
import { useI18n } from './hooks/useI18n';
//import { ButtonEdge } from './edges/ButtonEdge';

const nodeTypes = {
  textNode: TextNode,
  textConstruction: TextConstructionNode,
  imageNode: ImageNode,
  videoNode: VideoNode,
  videoInputNode: VideoInputNode,
  easeCurveNode: EaseCurveNode,
  audioInputNode: AudioInputNode,
  shotListNode: ShotListNode,
  omniComposerNode: OmniComposerNode,
  imageInputNode: ImageInputNode,
  outputNode: OutputNode,
  splitGridNode: SplitGridNode,
  imageCompareNode: ImageCompareNode,
  annotateNode: AnnotateNode,
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

    if (node.type === 'easeCurveNode') {
      Object.assign(data, {
        ...DEFAULT_EASE_CURVE_DATA,
        ...data,
        bezierHandles: normalizeBezierHandles(data.bezierHandles || DEFAULT_EASE_CURVE_DATA.bezierHandles),
        easingPreset: normalizeEasingPresetId(data.easingPreset) || null,
        outputDuration: Math.max(0.25, Number(data.outputDuration) || DEFAULT_EASE_CURVE_DATA.outputDuration),
        progress: Number.isFinite(Number(data.progress)) ? Number(data.progress) : 0,
      });
      if (typeof data.outputVideo === 'string' && data.outputVideo.startsWith('blob:')) {
        data.outputVideo = null;
        data.outputVideoWarning = 'Temporary Easy Curve output was cleared on load. Apply the curve again.';
        data.status = 'idle';
      }
    }

    if (node.type === 'videoInputNode') {
      data.aspectRatio = getVideoInputNodeAspectRatio(data) || DEFAULT_VIDEO_INPUT_ASPECT_RATIO;
      data.naturalWidth = Number.isFinite(Number(data.naturalWidth)) ? Number(data.naturalWidth) : null;
      data.naturalHeight = Number.isFinite(Number(data.naturalHeight)) ? Number(data.naturalHeight) : null;
      data.videoUrl = data.videoUrl || data.url || data.filePath || '';
    }

    const defaultSize = getNodeDefinition(node.type)?.defaultSize;
    const sizePatch =
      node.type === 'videoInputNode' && !hasValidNodeSize(node)
        ? getVideoInputNodeSizeByAspectRatio(data.aspectRatio || DEFAULT_VIDEO_INPUT_ASPECT_RATIO)
        : (node.type === 'imageNode' || node.type === 'videoNode') && !hasValidNodeSize(node)
        ? getImageNodeSizeByAspectRatio(
            node.type === 'videoNode'
              ? data.aspectRatio || '16:9'
              : getImageNodeAspectRatio(data)
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

const normalizeCanvasForLoad = (data = {}) => {
  const normalizedNodes = normalizeNodesForLoad(data.nodes || []);
  const { nodes: nextNodes, groups } = reconcileGroupsForLoad(normalizedNodes, data.groups || {});
  return {
    nodes: nextNodes,
    edges: normalizeEdges(data.edges || []),
    groups,
  };
};

const isValidViewport = (viewport) =>
  viewport &&
  Number.isFinite(Number(viewport.x)) &&
  Number.isFinite(Number(viewport.y)) &&
  Number.isFinite(Number(viewport.zoom)) &&
  Number(viewport.zoom) > 0;

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

const DEBUG_GROUPS = import.meta.env.DEV;

function FlowCanvas({ projectPath, projectFilePath, projectName, initialData }) {
  const initialCanvas = normalizeCanvasForLoad(initialData || {});
  const [nodes, setNodes, onNodesChange] = useNodesState(initialCanvas.nodes);
  const [edges, setEdges] = useEdgesState(initialCanvas.edges);
  const [groups, setGroups] = useState(initialCanvas.groups);
  const [saveStatus, setSaveStatus] = useState('idle');
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [isMiniMapCollapsed, setIsMiniMapCollapsed] = useState(false);
  const [isDraggingNode, setIsDraggingNode] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [appSettings, updateAppSetting] = useAppSettings();
  const { t } = useI18n();
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const isSavingRef = useRef(false);
  const latestCanvasRef = useRef({ nodes: [], edges: [], groups: {} });
  const latestProjectRef = useRef({ projectPath, projectFilePath, projectName });
  const hasRestoredViewportRef = useRef(false);
  const pendingConnectionRef = useRef(null);
  const connectionSuccessfulRef = useRef(false);
  const { commitHistory, undo, redo } = useCanvasHistory({
    nodes,
    edges,
    groups,
    setNodes,
    setEdges,
    setGroups,
    maxHistory: 50,
  });
  const { screenToFlowPosition, getViewport, setViewport } = useReactFlow();

  const restoreProjectViewport = useCallback(
    (viewport) => {
      if (hasRestoredViewportRef.current || !isValidViewport(viewport)) return;
      hasRestoredViewportRef.current = true;
      const nextViewport = {
        x: Number(viewport.x),
        y: Number(viewport.y),
        zoom: Number(viewport.zoom),
      };
      window.setTimeout(() => {
        setViewport(nextViewport);
      }, 50);
    },
    [setViewport]
  );

  useEffect(() => {
    hasRestoredViewportRef.current = false;
  }, [projectPath]);

  //
  useEffect(() => {
    if (initialData && Array.isArray(initialData.nodes)) {
      const nextCanvas = normalizeCanvasForLoad(initialData);
      setNodes(applyImageInputConnectionFlags(nextCanvas.nodes, nextCanvas.edges));
      setEdges(nextCanvas.edges);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setGroups(nextCanvas.groups);
      restoreProjectViewport(initialData.viewport);
    }
  }, [initialData, setNodes, setEdges, setGroups, restoreProjectViewport]);

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
    latestCanvasRef.current = { nodes, edges, groups };
  }, [nodes, edges, groups]);

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
        const nextCanvas = normalizeCanvasForLoad(result.data);
        setNodes(applyImageInputConnectionFlags(nextCanvas.nodes, nextCanvas.edges));
        setEdges(nextCanvas.edges);
        setGroups(nextCanvas.groups);
        restoreProjectViewport(result.data.viewport);
      }
    };
    if (projectPath && !initialData) loadProject();
  }, [projectPath, initialData, setNodes, setEdges, setGroups, restoreProjectViewport]);

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
        groups,
        viewport: getViewport(),
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
    [projectPath, projectFilePath, projectName, nodes, edges, groups, getViewport]
  );

  useEffect(() => {
    if (!projectPath) return undefined;

    const saveLatestCanvas = async () => {
      const { nodes: latestNodes, edges: latestEdges, groups: latestGroups } = latestCanvasRef.current;
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
        groups: latestGroups,
        viewport: getViewport(),
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
  }, [projectPath, getViewport]);

  const handleCanvasCopy = useCallback(() => {
    const { nodes: currentNodes, edges: currentEdges } = latestCanvasRef.current;
    const selectedNodes = currentNodes.filter((n) => n.selected);
    if (selectedNodes.length === 0) return;

    const selectedNodeIds = new Set(selectedNodes.map((n) => n.id));
    const internalEdges = currentEdges.filter(
      (e) => selectedNodeIds.has(e.source) && selectedNodeIds.has(e.target)
    );

    const clipboardData = {
      __isNodeCanvasClipboard: true,
      nodes: selectedNodes,
      edges: internalEdges,
    };

    try {
      navigator.clipboard.writeText(JSON.stringify(clipboardData));
    } catch (err) {
      console.warn('[App] System clipboard write failed:', err);
    }
    window.__nodeCanvasClipboard = clipboardData;
  }, []);

  const pasteCanvasClipboardData = useCallback((clipboardData) => {
    if (!clipboardData || !clipboardData.__isNodeCanvasClipboard) return;

    const { nodes: currentNodes, edges: currentEdges, groups: currentGroups } = latestCanvasRef.current;
    const oldToNewIdMap = {};
    const now = Date.now();

    const nextPastedNodes = clipboardData.nodes.map((oldNode, index) => {
      const newId = `${oldNode.type}-${now}-${index}-${Math.random().toString(36).substr(2, 5)}`;
      oldToNewIdMap[oldNode.id] = newId;

      const cleanedData = { ...(oldNode.data || {}) };
      cleanedData.projectPath = projectPath;

      // Clean running, error, outputs and temporary resource fields
      delete cleanedData.runRequestId;
      delete cleanedData.progress;
      delete cleanedData.status;
      delete cleanedData.error;
      delete cleanedData.errorMessage;
      delete cleanedData.outputText;
      delete cleanedData.outputVideo;
      delete cleanedData.outputVideoWarning;
      delete cleanedData.outputMetadata;
      delete cleanedData.outputs;
      delete cleanedData.slices;
      delete cleanedData.outputImages;
      delete cleanedData.dataUrl;
      delete cleanedData.groupId;

      cleanedData.status = 'idle';

      return {
        ...oldNode,
        id: newId,
        groupId: undefined,
        position: {
          x: (oldNode.position?.x ?? 0) + 40,
          y: (oldNode.position?.y ?? 0) + 40,
        },
        data: cleanedData,
        selected: true,
        dragging: false,
      };
    });

    const nextPastedEdges = clipboardData.edges.map((oldEdge, index) => {
      const newEdgeId = `edge-${now}-${index}-${Math.random().toString(36).substr(2, 5)}`;
      return {
        ...oldEdge,
        id: newEdgeId,
        source: oldToNewIdMap[oldEdge.source],
        target: oldToNewIdMap[oldEdge.target],
      };
    });

    const updatedCurrentNodes = currentNodes.map((node) => ({
      ...node,
      selected: false,
    }));

    const newNodes = updatedCurrentNodes.concat(nextPastedNodes);
    const newEdges = currentEdges.concat(nextPastedEdges);

    setNodes(newNodes);
    setEdges(newEdges);
    commitHistory(newNodes, newEdges, currentGroups);
  }, [projectPath, setNodes, setEdges, commitHistory]);

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
        return;
      }

      if (key === 'c') {
        event.preventDefault();
        handleCanvasCopy();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [redo, saveProject, undo, handleCanvasCopy]);

  // Keep projectPath mirrored into node data for runtime operations.
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
  const getNodeDisplayLabel = useCallback(
    (node) => getNodeDefinitionText(t, node, 'label'),
    [t]
  );
  const getNodeDisplayDescription = useCallback(
    (node) => getNodeDefinitionText(t, node, 'description'),
    [t]
  );

  const filteredNodes = useMemo(() => {
    const normalizedQuery = query.toLowerCase();
    return availableNodes.filter((node) =>
      `${getNodeDisplayLabel(node)} ${getNodeDisplayDescription(node)}`.toLowerCase().includes(normalizedQuery)
    );
  }, [availableNodes, getNodeDisplayDescription, getNodeDisplayLabel, query]);

  // Global paste handler for canvas image files and node clipboard data.
  useEffect(() => {
    const handleGlobalPaste = async (e) => {
      if (isEditableShortcutTarget(e.target)) return;

      const clipboardData = e.clipboardData;
      if (!clipboardData) return;

      let targetFile = null;

      // Prefer physical image files from the clipboard.
      const files = clipboardData.files;
      if (files && files.length > 0) {
        for (let i = 0; i < files.length; i++) {
          if (files[i].type.startsWith('image/')) {
            targetFile = files[i];
            break;
          }
        }
      }

      // Fall back to clipboard items when files are unavailable.
      if (!targetFile) {
        const items = clipboardData.items || [];
        for (let i = 0; i < items.length; i++) {
          if (items[i].type.startsWith('image/')) {
            targetFile = items[i].getAsFile();
            break;
          }
        }
      }

      if (targetFile) {
        e.preventDefault();

        if (!projectPath) {
          console.error('[App] projectPath not available for paste');
          return;
        }

        const flowPos = screenToFlowPosition({
          x: window.innerWidth / 2,
          y: window.innerHeight / 2,
        });

        let uploadResult;

        try {
          uploadResult = await uploadImageToInput(targetFile, {
            projectPath,
            sourceKind: 'paste',
            filename: targetFile.name,
            mimeType: targetFile.type,
          });
        } catch (error) {
          console.error('[App] Paste upload failed:', error);
          return;
        }

        const newNode = {
          id: `imageInputNode-${Date.now()}`,
          type: 'imageInputNode',
          position: flowPos,
          data: {
            url: uploadResult.url,
            sourceKind: 'paste',
            projectPath,
            filename: uploadResult.filename,
            mimeType: uploadResult.mimeType,
            width: uploadResult.width,
            height: uploadResult.height,
            bytes: uploadResult.bytes,
          },
        };

        const nextNodes = nodes.concat(newNode);
        setNodes(nextNodes);
        commitHistory(nextNodes, edges);
        return;
      }

      const textData = clipboardData.getData('text/plain');
      if (textData) {
        try {
          const parsed = JSON.parse(textData);
          if (parsed && parsed.__isNodeCanvasClipboard) {
            e.preventDefault();
            pasteCanvasClipboardData(parsed);
          }
        } catch {
          // Keep default paste behavior for ordinary text.
        }
      }
    };

    window.addEventListener('paste', handleGlobalPaste);
    return () => window.removeEventListener('paste', handleGlobalPaste);
  }, [commitHistory, edges, nodes, pasteCanvasClipboardData, screenToFlowPosition, setNodes, projectPath]);
  

  // Image file drop handler.
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

  // Open the search panel on double click.
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
          : type === 'videoInputNode'
            ? getVideoInputNodeSizeByAspectRatio(data.aspectRatio || DEFAULT_VIDEO_INPUT_ASPECT_RATIO)
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

  // Add a node from the dock and center it in the viewport.
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

  const applyCanvasState = useCallback(
    (nextNodes, nextEdges, nextGroups) => {
      latestCanvasRef.current = {
        nodes: nextNodes,
        edges: nextEdges,
        groups: nextGroups,
      };
      setNodes(nextNodes);
      setEdges(nextEdges);
      setGroups(nextGroups);
    },
    [setEdges, setGroups, setNodes]
  );

  const createGroup = useCallback(
    (nodeIds) => {
      const { nodes: latestNodes, edges: latestEdges, groups: latestGroups } = latestCanvasRef.current;
      const selectedNodeIds = Array.isArray(nodeIds) && nodeIds.length > 0
        ? nodeIds
        : latestNodes.filter((node) => node.selected).map((node) => node.id);

      if (DEBUG_GROUPS) {
        console.debug('[groups] createGroup invoked', {
          requestedNodeIds: nodeIds,
          selectedNodeIds,
          selectedCount: selectedNodeIds.length,
          groupCountBefore: Object.keys(latestGroups || {}).length,
        });
      }

      if (selectedNodeIds.length < 2) return;

      const nextState = createGroupState({ nodes: latestNodes, groups: latestGroups, nodeIds: selectedNodeIds });
      if (!nextState) {
        if (DEBUG_GROUPS) {
          console.debug('[groups] createGroupState returned null', {
            selectedNodeIds,
            nodeCount: latestNodes.length,
          });
        }
        return;
      }

      applyCanvasState(nextState.nodes, latestEdges, nextState.groups);
      commitHistory(nextState.nodes, latestEdges, nextState.groups, 'create-group');

      if (DEBUG_GROUPS) {
        console.debug('[groups] createGroup applied', {
          newGroupId: nextState.group.id,
          groupCountAfter: Object.keys(nextState.groups || {}).length,
          groupedNodeIds: nextState.nodes.filter((node) => node.groupId === nextState.group.id).map((node) => node.id),
          group: nextState.group,
        });
      }
    },
    [applyCanvasState, commitHistory]
  );

  // Kept for future group menu or shortcut actions.
  // eslint-disable-next-line no-unused-vars
  const removeNodesFromGroup = useCallback(
    (nodeIds) => {
      const { nodes: latestNodes, edges: latestEdges, groups: latestGroups } = latestCanvasRef.current;
      const nextState = removeNodesFromGroupState({ nodes: latestNodes, groups: latestGroups, nodeIds });

      applyCanvasState(nextState.nodes, latestEdges, nextState.groups);
      commitHistory(nextState.nodes, latestEdges, nextState.groups, 'remove-from-group');
    },
    [applyCanvasState, commitHistory]
  );

  const deleteGroup = useCallback(
    (groupId) => {
      const { nodes: latestNodes, edges: latestEdges, groups: latestGroups } = latestCanvasRef.current;
      const nextState = deleteGroupState({ nodes: latestNodes, groups: latestGroups, groupId });

      applyCanvasState(nextState.nodes, latestEdges, nextState.groups);
      commitHistory(nextState.nodes, latestEdges, nextState.groups, 'delete-group');
    },
    [applyCanvasState, commitHistory]
  );

  const moveGroup = useCallback(
    (groupId, delta, shouldCommit = false) => {
      const { nodes: latestNodes, edges: latestEdges, groups: latestGroups } = latestCanvasRef.current;
      const nextState =
        delta.x || delta.y
          ? moveGroupState({ nodes: latestNodes, groups: latestGroups, groupId, delta })
          : { nodes: latestNodes, groups: latestGroups };

      applyCanvasState(nextState.nodes, latestEdges, nextState.groups);
      if (shouldCommit) commitHistory(nextState.nodes, latestEdges, nextState.groups, 'move-group');
    },
    [applyCanvasState, commitHistory]
  );

  const resizeGroup = useCallback(
    (groupId, handle, delta, shouldCommit = false) => {
      const { nodes: latestNodes, edges: latestEdges, groups: latestGroups } = latestCanvasRef.current;
      const nextGroups =
        delta.x || delta.y ? resizeGroupState({ groups: latestGroups, groupId, handle, delta }) : latestGroups;

      applyCanvasState(latestNodes, latestEdges, nextGroups);
      if (shouldCommit) commitHistory(latestNodes, latestEdges, nextGroups, 'resize-group');
    },
    [applyCanvasState, commitHistory]
  );

  const renameGroup = useCallback(
    (groupId, name) => {
      const { nodes: latestNodes, edges: latestEdges, groups: latestGroups } = latestCanvasRef.current;
      const nextGroups = updateGroupState({ groups: latestGroups, groupId, patch: { name } });

      applyCanvasState(latestNodes, latestEdges, nextGroups);
      commitHistory(latestNodes, latestEdges, nextGroups, 'rename-group');
    },
    [applyCanvasState, commitHistory]
  );

  const changeGroupColor = useCallback(
    (groupId, color) => {
      const { nodes: latestNodes, edges: latestEdges, groups: latestGroups } = latestCanvasRef.current;
      const nextGroups = updateGroupState({ groups: latestGroups, groupId, patch: { color } });

      applyCanvasState(latestNodes, latestEdges, nextGroups);
      commitHistory(latestNodes, latestEdges, nextGroups, 'change-group-color');
    },
    [applyCanvasState, commitHistory]
  );

  const handleNodeDragStop = useCallback(
    (event, draggedNode) => {
      setIsDraggingNode(false);
      if (!draggedNode?.id) return;

      const { nodes: latestNodes, edges: latestEdges, groups: latestGroups } = latestCanvasRef.current;
      const nextNodes = assignNodeToContainingGroupState({
        nodes: latestNodes,
        groups: latestGroups,
        nodeId: draggedNode.id,
      });

      if (nextNodes === latestNodes) return;
      applyCanvasState(nextNodes, latestEdges, latestGroups);
      commitHistory(nextNodes, latestEdges, latestGroups, 'node-group-assignment');
    },
    [applyCanvasState, commitHistory]
  );

  return (
    <div 
      style={{
        width: '100vw',
        height: '100vh',
        '--canvas-background-color': appSettings.canvasBackgroundColor || '#0b0b0b',
      }}
      onDoubleClick={handleContainerDoubleClick} 
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleCanvasDrop}
      className={`relative canvas-container ${isDraggingNode ? 'is-node-dragging' : ''}`}
    >
      {/* Main canvas render area */}
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
          onClick={() => setSettingsOpen(true)}
          className={`flex h-10 w-10 items-center justify-center rounded-full border text-white/60 shadow-[0_18px_40px_rgba(0,0,0,0.35)] backdrop-blur-xl transition-all hover:border-white/20 hover:bg-[#181818]/90 hover:text-white/85 ${
            settingsOpen ? 'border-white/25 bg-[#181818]/90 text-white' : 'border-white/10 bg-[#121212]/75'
          }`}
          aria-label={t('settings.title')}
          title={t('settings.title')}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.4 15a1.8 1.8 0 0 0 .36 1.98l.05.05a2.1 2.1 0 1 1-2.97 2.97l-.05-.05a1.8 1.8 0 0 0-1.98-.36 1.8 1.8 0 0 0-1.1 1.66V21.4a2.1 2.1 0 1 1-4.2 0v-.07a1.8 1.8 0 0 0-1.1-1.66 1.8 1.8 0 0 0-1.98.36l-.05.05a2.1 2.1 0 1 1-2.97-2.97l.05-.05A1.8 1.8 0 0 0 3.8 15a1.8 1.8 0 0 0-1.66-1.1H2.1a2.1 2.1 0 1 1 0-4.2h.07a1.8 1.8 0 0 0 1.66-1.1 1.8 1.8 0 0 0-.36-1.98l-.05-.05A2.1 2.1 0 1 1 6.4 3.6l.05.05a1.8 1.8 0 0 0 1.98.36 1.8 1.8 0 0 0 1.1-1.66V2.1a2.1 2.1 0 1 1 4.2 0v.07a1.8 1.8 0 0 0 1.1 1.66 1.8 1.8 0 0 0 1.98-.36l.05-.05a2.1 2.1 0 1 1 2.97 2.97l-.05.05a1.8 1.8 0 0 0-.36 1.98 1.8 1.8 0 0 0 1.66 1.1h.07a2.1 2.1 0 1 1 0 4.2h-.07A1.8 1.8 0 0 0 19.4 15Z" />
          </svg>
        </button>

      </div>

      <SettingsModal
        open={settingsOpen}
        settings={appSettings}
        onSettingChange={updateAppSetting}
        onClose={closeSettings}
      />

      <ReactFlow 
        className="node-canvas-flow"
        nodes={nodes} 
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onEdgeClick={handleEdgeClick}
        onConnect={onConnect}
        onConnectStart={handleConnectStart}
        onConnectEnd={handleConnectEnd}
        onNodeDragStart={() => setIsDraggingNode(true)}
        onNodeDragStop={handleNodeDragStop}
        nodeTypes={nodeTypes} 
        edgeTypes={edgeTypes}
        isValidConnection={isValidConnection}
        zoomOnDoubleClick={false} 
        minZoom={0.05}
        maxZoom={4}
        deleteKeyCode={['Backspace', 'Delete']}
        selectionMode="full"
        onPaneClick={handlePaneClick}
        onlyRenderVisibleElements={ONLY_RENDER_VISIBLE_ELEMENTS}
      >
        <Background variant="dots" gap={20} size={1} color={appSettings.canvasGridColor || '#222'} />
        <GroupsOverlay
          nodes={nodes}
          groups={groups}
          onCreateGroup={createGroup}
          onMoveGroup={moveGroup}
          onResizeGroup={resizeGroup}
          onDeleteGroup={deleteGroup}
          onRenameGroup={renameGroup}
          onChangeGroupColor={changeGroupColor}
        />
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
        aria-label={isMiniMapCollapsed ? t('minimap.show') : t('minimap.hide')}
        title={isMiniMapCollapsed ? t('minimap.show') : t('minimap.hide')}
      >
        {isMiniMapCollapsed ? t('minimap.show') : t('minimap.hide')}
      </button>

      {/* Search panel */}
      {searchMenu.show && (
        <div 
          style={{ top: `${searchMenu.y}px`, left: `${searchMenu.x}px` }} 
          onMouseDown={(e) => e.stopPropagation()}
          className="absolute z-[999] bg-[#141414] border border-white/5 rounded-[20px] p-3.5 w-[360px] shadow-[0_25px_60px_rgba(0,0,0,0.6)] animate-in fade-in zoom-in-95 duration-150 nodrag nopan"
        >
          <input
            type="text"
            autoFocus
            placeholder={t('search.placeholder')}
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
                  <span>{getNodeDisplayLabel(node)}</span>
                  <span className="text-[10px] opacity-0 group-hover:opacity-30 transition-opacity font-mono">&gt;</span>
                </div>
              ))
            ) : (
              <div className="px-4 py-4 text-sm text-white/20 text-center font-light">{t('search.noResults')}</div>
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

      {/* Floating dock */}
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
