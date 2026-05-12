import { useCallback, useEffect, useRef, useState } from 'react';
import { PERF_DEBUG } from '../utils/perfDebug';

const DEFAULT_DEBOUNCE_MS = 800;

const cloneValue = (value) => {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
};

const sanitizeNodesForHistory = (nodes = []) =>
  nodes.map((node) => {
    const { selected, dragging, resizing, ...restNode } = node;
    return {
      ...restNode,
      data: { ...(restNode.data || {}) },
    };
  });

const sanitizeEdgesForHistory = (edges = []) =>
  edges.map((edge) => {
    const { selected, ...restEdge } = edge;
    const data = { ...(restEdge.data || {}) };
    delete data.flowing;
    return {
      ...restEdge,
      data,
      className: restEdge.className === 'flowing' ? '' : restEdge.className,
    };
  });

const createSnapshot = (nodes, edges) => ({
  nodes: cloneValue(sanitizeNodesForHistory(nodes)),
  edges: cloneValue(sanitizeEdgesForHistory(edges)),
});

const createShallowSnapshot = (nodes, edges) => ({
  nodes: sanitizeNodesForHistory(nodes),
  edges: sanitizeEdgesForHistory(edges),
});

const getSnapshotHash = (snapshot) => JSON.stringify(snapshot);

const createLayoutComparableSnapshot = (nodes = [], edges = []) => ({
  nodes: nodes.map((node) => ({
    id: node.id,
    position: node.position || null,
    width: node.width ?? null,
    height: node.height ?? null,
  })),
  edges: edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    sourceHandle: edge.sourceHandle ?? edge.sourceHandleId ?? null,
    target: edge.target,
    targetHandle: edge.targetHandle ?? edge.targetHandleId ?? null,
  })),
});

const getLayoutSnapshotHash = (nodes, edges) =>
  JSON.stringify(createLayoutComparableSnapshot(nodes, edges));

const extractLayoutNodes = (nodes = []) =>
  nodes.map((node) => ({
    id: node.id,
    position: node.position ? { ...node.position } : null,
    width: node.width ?? null,
    height: node.height ?? null,
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
  setNodes,
  setEdges,
  maxHistory = 50,
  debounceMs = DEFAULT_DEBOUNCE_MS,
}) {
  const pastRef = useRef([]);
  const futureRef = useRef([]);
  const latestNodesRef = useRef(nodes);
  const latestEdgesRef = useRef(edges);
  const lastSnapshotRef = useRef(createSnapshot(nodes, edges));
  const lastSnapshotHashRef = useRef(getSnapshotHash(lastSnapshotRef.current));
  const debounceTimerRef = useRef(null);
  const isApplyingHistoryRef = useRef(false);
  const wasInteractingRef = useRef(false);
  const pendingInteractionSnapshotRef = useRef(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    latestNodesRef.current = nodes;
    latestEdgesRef.current = edges;
  }, [nodes, edges]);

  const refreshState = useCallback(() => setVersion((value) => value + 1), []);

  const clearTimer = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }, []);

  const commitHistory = useCallback((nextNodes = latestNodesRef.current, nextEdges = latestEdgesRef.current, reason = 'full') => {
    if (isApplyingHistoryRef.current) return false;

    const t0 = performance.now();
    const nextSnapshot = createSnapshot(nextNodes, nextEdges);
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

  const commitLayoutHistory = useCallback((nextNodes = latestNodesRef.current, nextEdges = latestEdgesRef.current) => {
    if (isApplyingHistoryRef.current) return false;

    const t0 = performance.now();
    const nextLayoutHash = getLayoutSnapshotHash(nextNodes, nextEdges);
    const previousLayoutHash = getLayoutSnapshotHash(lastSnapshotRef.current.nodes, lastSnapshotRef.current.edges);
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
      },
    ].slice(-maxHistory);
    futureRef.current = [];
    lastSnapshotRef.current = createShallowSnapshot(nextNodes, nextEdges);
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
      commitHistory(undefined, undefined, 'debounced-full');
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
      commitLayoutHistory(nodes, edges);
      return clearTimer;
    }

    scheduleHistoryCommit();
    return clearTimer;
  }, [nodes, edges, scheduleHistoryCommit, clearTimer, commitLayoutHistory]);

  const undo = useCallback(() => {
    clearTimer();
    const previousEntry = pastRef.current[pastRef.current.length - 1];
    if (!previousEntry) return false;

    pastRef.current = pastRef.current.slice(0, -1);

    isApplyingHistoryRef.current = true;

    if (previousEntry.kind === 'layout') {
      const nextNodes = applyLayoutNodes(latestNodesRef.current, previousEntry.before);
      futureRef.current = [...futureRef.current, previousEntry].slice(-maxHistory);
      lastSnapshotRef.current = createShallowSnapshot(nextNodes, latestEdgesRef.current);
      lastSnapshotHashRef.current = getLayoutSnapshotHash(nextNodes, latestEdgesRef.current);
      setNodes(nextNodes);
    } else {
      const currentSnapshot = createSnapshot(latestNodesRef.current, latestEdgesRef.current);
      futureRef.current = [...futureRef.current, currentSnapshot].slice(-maxHistory);
      lastSnapshotRef.current = cloneValue(previousEntry);
      lastSnapshotHashRef.current = getSnapshotHash(previousEntry);
      setNodes(cloneValue(previousEntry.nodes));
      setEdges(cloneValue(previousEntry.edges));
    }

    refreshState();

    setTimeout(() => {
      isApplyingHistoryRef.current = false;
    }, 0);

    return true;
  }, [clearTimer, maxHistory, refreshState, setEdges, setNodes]);

  const redo = useCallback(() => {
    clearTimer();
    const nextEntry = futureRef.current[futureRef.current.length - 1];
    if (!nextEntry) return false;

    futureRef.current = futureRef.current.slice(0, -1);

    isApplyingHistoryRef.current = true;

    if (nextEntry.kind === 'layout') {
      const nextNodes = applyLayoutNodes(latestNodesRef.current, nextEntry.after);
      pastRef.current = [...pastRef.current, nextEntry].slice(-maxHistory);
      lastSnapshotRef.current = createShallowSnapshot(nextNodes, latestEdgesRef.current);
      lastSnapshotHashRef.current = getLayoutSnapshotHash(nextNodes, latestEdgesRef.current);
      setNodes(nextNodes);
    } else {
      const currentSnapshot = createSnapshot(latestNodesRef.current, latestEdgesRef.current);
      pastRef.current = [...pastRef.current, currentSnapshot].slice(-maxHistory);
      lastSnapshotRef.current = cloneValue(nextEntry);
      lastSnapshotHashRef.current = getSnapshotHash(nextEntry);
      setNodes(cloneValue(nextEntry.nodes));
      setEdges(cloneValue(nextEntry.edges));
    }

    refreshState();

    setTimeout(() => {
      isApplyingHistoryRef.current = false;
    }, 0);

    return true;
  }, [clearTimer, maxHistory, refreshState, setEdges, setNodes]);

  const clear = useCallback(() => {
    clearTimer();
    pastRef.current = [];
    futureRef.current = [];
    lastSnapshotRef.current = createSnapshot(latestNodesRef.current, latestEdgesRef.current);
    lastSnapshotHashRef.current = getSnapshotHash(lastSnapshotRef.current);
    refreshState();
  }, [clearTimer, refreshState]);

  useEffect(() => clearTimer, [clearTimer]);

  return {
    commitHistory,
    scheduleHistoryCommit,
    undo,
    redo,
    clear,
    canUndo: pastRef.current.length > 0,
    canRedo: futureRef.current.length > 0,
    isApplyingHistoryRef,
    historyVersion: version,
  };
}
