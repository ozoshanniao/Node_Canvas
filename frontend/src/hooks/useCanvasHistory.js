import { useCallback, useEffect, useRef, useState } from 'react';
import { PERF_DEBUG } from '../utils/perfDebug.js';

const DEFAULT_DEBOUNCE_MS = 800;

const cloneValue = (value) => {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
};

const sanitizeNodesForHistory = (nodes = []) =>
  nodes.map((node) => {
    const restNode = { ...node };
    delete restNode.selected;
    delete restNode.dragging;
    delete restNode.resizing;
    const nodeData = { ...(restNode.data || {}) };

    // Strip base64 image fields to reduce snapshot size
    delete nodeData.dataUrl;
    delete nodeData.previewUrl;
    delete nodeData.previewSourceUrl;
    delete nodeData.thumbnailUrl;
    delete nodeData.fittedSourceUrl;

    // Strip base64 from images array if present
    if (Array.isArray(nodeData.images)) {
      nodeData.images = nodeData.images.map((img) => {
        if (!img || typeof img !== 'object') return img;
        const restImg = { ...img };
        delete restImg.dataUrl;
        delete restImg.previewUrl;
        delete restImg.previewSourceUrl;
        delete restImg.thumbnailUrl;
        return restImg;
      });
    }

    return {
      ...restNode,
      data: nodeData,
    };
  });

export const sanitizeEdgesForHistory = (edges = []) =>
  edges.map((edge) => {
    const restEdge = { ...edge };
    delete restEdge.selected;
    const data = { ...(restEdge.data || {}) };
    delete data.flowing;
    return {
      ...restEdge,
      data,
      className: restEdge.className === 'flowing' ? '' : restEdge.className,
    };
  });

const sanitizeGroupsForHistory = (groups = {}) => cloneValue(groups || {});

export const createSnapshot = (nodes, edges, groups = {}) => ({
  nodes: cloneValue(sanitizeNodesForHistory(nodes)),
  edges: cloneValue(sanitizeEdgesForHistory(edges)),
  groups: sanitizeGroupsForHistory(groups),
});

const createShallowSnapshot = (nodes, edges, groups = {}) => ({
  nodes: sanitizeNodesForHistory(nodes),
  edges: sanitizeEdgesForHistory(edges),
  groups,
});

export const getSnapshotHash = (snapshot) => JSON.stringify(snapshot);

const createLayoutComparableSnapshot = (nodes = [], edges = [], groups = {}) => ({
  nodes: nodes.map((node) => ({
    id: node.id,
    position: node.position || null,
    width: node.width ?? null,
    height: node.height ?? null,
    groupId: node.groupId ?? null,
  })),
  edges: edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    sourceHandle: edge.sourceHandle ?? edge.sourceHandleId ?? null,
    target: edge.target,
    targetHandle: edge.targetHandle ?? edge.targetHandleId ?? null,
  })),
  groups,
});

const getLayoutSnapshotHash = (nodes, edges, groups) =>
  JSON.stringify(createLayoutComparableSnapshot(nodes, edges, groups));

const extractLayoutNodes = (nodes = []) =>
  nodes.map((node) => ({
    id: node.id,
    position: node.position ? { ...node.position } : null,
    width: node.width ?? null,
    height: node.height ?? null,
    groupId: node.groupId ?? null,
  }));

const applyLayoutNodes = (nodes = [], layoutNodes = []) => {
  const layoutMap = new Map(layoutNodes.map((node) => [node.id, node]));
  return nodes.map((node) => {
    const layout = layoutMap.get(node.id);
    if (!layout) return node;

    return {
      ...node,
      ...(layout.position ? { position: { ...layout.position } } : {}),
      ...(layout.width == null ? {} : { width: layout.width }),
      ...(layout.height == null ? {} : { height: layout.height }),
      ...(layout.groupId == null ? { groupId: undefined } : { groupId: layout.groupId }),
    };
  });
};

const estimateImageDataSize = (nodes = []) => {
  let total = 0;
  const addStringSize = (value) => {
    if (typeof value === 'string' && value.startsWith('data:image/')) {
      total += value.length;
    }
  };

  for (const node of nodes) {
    const data = node?.data || {};
    for (const key of ['dataUrl', 'previewUrl', 'thumbnailUrl', 'url']) {
      addStringSize(data[key]);
    }
    if (Array.isArray(data.images)) {
      for (const image of data.images) {
        for (const key of ['dataUrl', 'previewUrl', 'thumbnailUrl', 'url']) {
          addStringSize(image?.[key]);
        }
      }
    }
  }

  return total;
};

const logHistoryTiming = ({
  reason,
  nodes,
  edges,
  sanitizeMs,
  stringifyMs,
  totalMs,
  snapshotBytes,
}) => {
  if (!PERF_DEBUG) return;

  console.log('[History commit timing]', {
    reason,
    nodes: nodes.length,
    edges: edges.length,
    sanitizeMs,
    stringifyMs,
    totalMs,
    snapshotBytes,
    imageDataBytesApprox: estimateImageDataSize(nodes),
  });
};

export function useCanvasHistory({
  nodes,
  edges,
  groups = {},
  setNodes,
  setEdges,
  setGroups,
  maxHistory = 50,
  debounceMs = DEFAULT_DEBOUNCE_MS,
}) {
  const pastRef = useRef([]);
  const futureRef = useRef([]);
  const latestNodesRef = useRef(nodes);
  const latestEdgesRef = useRef(edges);
  const latestGroupsRef = useRef(groups);
  const initialSnapshot = createSnapshot(nodes, edges, groups);
  const lastSnapshotRef = useRef(initialSnapshot);
  const lastSnapshotHashRef = useRef(getSnapshotHash(initialSnapshot));
  const debounceTimerRef = useRef(null);
  const isApplyingHistoryRef = useRef(false);
  const wasInteractingRef = useRef(false);
  const pendingInteractionSnapshotRef = useRef(false);
  const [version, setVersion] = useState(0);
  const [availability, setAvailability] = useState({ canUndo: false, canRedo: false });

  useEffect(() => {
    latestNodesRef.current = nodes;
    latestEdgesRef.current = edges;
    latestGroupsRef.current = groups;
  }, [nodes, edges, groups]);

  const refreshState = useCallback(() => {
    setAvailability({
      canUndo: pastRef.current.length > 0,
      canRedo: futureRef.current.length > 0,
    });
    setVersion((value) => value + 1);
  }, []);

  const clearTimer = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }, []);

  const commitHistory = useCallback((nextNodes = latestNodesRef.current, nextEdges = latestEdgesRef.current, nextGroups = latestGroupsRef.current, reason = 'full') => {
    if (isApplyingHistoryRef.current) return false;
    if (typeof nextGroups === 'string') {
      reason = nextGroups;
      nextGroups = latestGroupsRef.current;
    }

    const t0 = performance.now();
    const nextSnapshot = createSnapshot(nextNodes, nextEdges, nextGroups);
    const t1 = performance.now();
    const nextHash = getSnapshotHash(nextSnapshot);
    const t2 = performance.now();

    if (nextHash === lastSnapshotHashRef.current) {
      logHistoryTiming({
        reason,
        nodes: nextNodes,
        edges: nextEdges,
        sanitizeMs: t1 - t0,
        stringifyMs: t2 - t1,
        totalMs: t2 - t0,
        snapshotBytes: nextHash.length,
      });
      return false;
    }

    pastRef.current = [...pastRef.current, lastSnapshotRef.current].slice(-maxHistory);
    futureRef.current = [];
    lastSnapshotRef.current = nextSnapshot;
    lastSnapshotHashRef.current = nextHash;
    refreshState();
    const t3 = performance.now();
    logHistoryTiming({
      reason,
      nodes: nextNodes,
      edges: nextEdges,
      sanitizeMs: t1 - t0,
      stringifyMs: t2 - t1,
      totalMs: t3 - t0,
      snapshotBytes: nextHash.length,
    });
    return true;
  }, [maxHistory, refreshState]);

  const commitDiscreteHistory = useCallback((
    nextNodes = latestNodesRef.current,
    nextEdges = latestEdgesRef.current,
    nextGroups = latestGroupsRef.current,
    reason = 'discrete'
  ) => {
    clearTimer();
    return commitHistory(nextNodes, nextEdges, nextGroups, reason);
  }, [clearTimer, commitHistory]);
  const commitLayoutHistory = useCallback((nextNodes = latestNodesRef.current, nextEdges = latestEdgesRef.current, nextGroups = latestGroupsRef.current) => {
    if (isApplyingHistoryRef.current) return false;

    const t0 = performance.now();
    const nextLayoutHash = getLayoutSnapshotHash(nextNodes, nextEdges, nextGroups);
    const previousLayoutHash = getLayoutSnapshotHash(lastSnapshotRef.current.nodes, lastSnapshotRef.current.edges, lastSnapshotRef.current.groups);
    const t1 = performance.now();

    if (nextLayoutHash === previousLayoutHash) {
      logHistoryTiming({
        reason: 'layout-interaction',
        nodes: nextNodes,
        edges: nextEdges,
        sanitizeMs: 0,
        stringifyMs: t1 - t0,
        totalMs: t1 - t0,
        snapshotBytes: nextLayoutHash.length,
      });
      return false;
    }

    pastRef.current = [
      ...pastRef.current,
      {
        kind: 'layout',
        before: extractLayoutNodes(lastSnapshotRef.current.nodes),
        after: extractLayoutNodes(nextNodes),
        beforeGroups: cloneValue(lastSnapshotRef.current.groups || {}),
        afterGroups: cloneValue(nextGroups || {}),
      },
    ].slice(-maxHistory);
    futureRef.current = [];
    lastSnapshotRef.current = createShallowSnapshot(nextNodes, nextEdges, nextGroups);
    lastSnapshotHashRef.current = nextLayoutHash;
    refreshState();
    const t2 = performance.now();
    logHistoryTiming({
      reason: 'layout-interaction',
      nodes: nextNodes,
      edges: nextEdges,
      sanitizeMs: 0,
      stringifyMs: t1 - t0,
      totalMs: t2 - t0,
      snapshotBytes: nextLayoutHash.length,
    });
    return true;
  }, [maxHistory, refreshState]);

  const scheduleHistoryCommit = useCallback(() => {
    if (isApplyingHistoryRef.current) return;

    clearTimer();
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      commitHistory(undefined, undefined, undefined, 'debounced-full');
    }, debounceMs);
  }, [clearTimer, commitHistory, debounceMs]);

  useEffect(() => {
    if (isApplyingHistoryRef.current) return clearTimer;

    const isInteracting = nodes.some((node) => node.dragging || node.resizing);

    if (isInteracting) {
      wasInteractingRef.current = true;
      pendingInteractionSnapshotRef.current = true;
      clearTimer();
      return clearTimer;
    }

    if (wasInteractingRef.current || pendingInteractionSnapshotRef.current) {
      wasInteractingRef.current = false;
      pendingInteractionSnapshotRef.current = false;
      clearTimer();
      commitLayoutHistory(nodes, edges, groups);
      return clearTimer;
    }

    scheduleHistoryCommit();
    return clearTimer;
  }, [nodes, edges, groups, scheduleHistoryCommit, clearTimer, commitLayoutHistory]);

  const undo = useCallback(() => {
    clearTimer();
    const previousEntry = pastRef.current[pastRef.current.length - 1];
    if (!previousEntry) return false;

    pastRef.current = pastRef.current.slice(0, -1);

    isApplyingHistoryRef.current = true;

    if (previousEntry.kind === 'layout') {
      const nextNodes = applyLayoutNodes(latestNodesRef.current, previousEntry.before);
      futureRef.current = [...futureRef.current, previousEntry].slice(-maxHistory);
      lastSnapshotRef.current = createShallowSnapshot(nextNodes, latestEdgesRef.current, previousEntry.beforeGroups || {});
      lastSnapshotHashRef.current = getLayoutSnapshotHash(nextNodes, latestEdgesRef.current, previousEntry.beforeGroups || {});
      setNodes(nextNodes);
      setGroups?.(cloneValue(previousEntry.beforeGroups || {}));
    } else {
      const currentSnapshot = createSnapshot(latestNodesRef.current, latestEdgesRef.current, latestGroupsRef.current);
      futureRef.current = [...futureRef.current, currentSnapshot].slice(-maxHistory);
      lastSnapshotRef.current = cloneValue(previousEntry);
      lastSnapshotHashRef.current = getSnapshotHash(previousEntry);
      setNodes(cloneValue(previousEntry.nodes));
      setEdges(cloneValue(previousEntry.edges));
      setGroups?.(cloneValue(previousEntry.groups || {}));
    }

    refreshState();

    setTimeout(() => {
      isApplyingHistoryRef.current = false;
    }, 0);

    return true;
  }, [clearTimer, maxHistory, refreshState, setEdges, setGroups, setNodes]);

  const redo = useCallback(() => {
    clearTimer();
    const nextEntry = futureRef.current[futureRef.current.length - 1];
    if (!nextEntry) return false;

    futureRef.current = futureRef.current.slice(0, -1);

    isApplyingHistoryRef.current = true;

    if (nextEntry.kind === 'layout') {
      const nextNodes = applyLayoutNodes(latestNodesRef.current, nextEntry.after);
      pastRef.current = [...pastRef.current, nextEntry].slice(-maxHistory);
      lastSnapshotRef.current = createShallowSnapshot(nextNodes, latestEdgesRef.current, nextEntry.afterGroups || {});
      lastSnapshotHashRef.current = getLayoutSnapshotHash(nextNodes, latestEdgesRef.current, nextEntry.afterGroups || {});
      setNodes(nextNodes);
      setGroups?.(cloneValue(nextEntry.afterGroups || {}));
    } else {
      const currentSnapshot = createSnapshot(latestNodesRef.current, latestEdgesRef.current, latestGroupsRef.current);
      pastRef.current = [...pastRef.current, currentSnapshot].slice(-maxHistory);
      lastSnapshotRef.current = cloneValue(nextEntry);
      lastSnapshotHashRef.current = getSnapshotHash(nextEntry);
      setNodes(cloneValue(nextEntry.nodes));
      setEdges(cloneValue(nextEntry.edges));
      setGroups?.(cloneValue(nextEntry.groups || {}));
    }

    refreshState();

    setTimeout(() => {
      isApplyingHistoryRef.current = false;
    }, 0);

    return true;
  }, [clearTimer, maxHistory, refreshState, setEdges, setGroups, setNodes]);

  const clear = useCallback(() => {
    clearTimer();
    pastRef.current = [];
    futureRef.current = [];
    lastSnapshotRef.current = createSnapshot(latestNodesRef.current, latestEdgesRef.current, latestGroupsRef.current);
    lastSnapshotHashRef.current = getSnapshotHash(lastSnapshotRef.current);
    refreshState();
  }, [clearTimer, refreshState]);

  useEffect(() => clearTimer, [clearTimer]);

  return {
    commitHistory,
    commitDiscreteHistory,
    scheduleHistoryCommit,
    undo,
    redo,
    clear,
    canUndo: availability.canUndo,
    canRedo: availability.canRedo,
    isApplyingHistoryRef,
    historyVersion: version,
  };
}
