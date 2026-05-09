import { useCallback, useEffect, useRef, useState } from 'react';

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

const getSnapshotHash = (snapshot) => JSON.stringify(snapshot);

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

  const commitHistory = useCallback((nextNodes = latestNodesRef.current, nextEdges = latestEdgesRef.current) => {
    if (isApplyingHistoryRef.current) return false;

    const nextSnapshot = createSnapshot(nextNodes, nextEdges);
    const nextHash = getSnapshotHash(nextSnapshot);

    if (nextHash === lastSnapshotHashRef.current) return false;

    pastRef.current = [...pastRef.current, lastSnapshotRef.current].slice(-maxHistory);
    futureRef.current = [];
    lastSnapshotRef.current = nextSnapshot;
    lastSnapshotHashRef.current = nextHash;
    refreshState();
    return true;
  }, [maxHistory, refreshState]);

  const scheduleHistoryCommit = useCallback(() => {
    if (isApplyingHistoryRef.current) return;

    clearTimer();
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      commitHistory();
    }, debounceMs);
  }, [clearTimer, commitHistory, debounceMs]);

  useEffect(() => {
    scheduleHistoryCommit();
    return clearTimer;
  }, [nodes, edges, scheduleHistoryCommit, clearTimer]);

  const undo = useCallback(() => {
    clearTimer();
    const previousSnapshot = pastRef.current[pastRef.current.length - 1];
    if (!previousSnapshot) return false;

    const currentSnapshot = createSnapshot(latestNodesRef.current, latestEdgesRef.current);
    pastRef.current = pastRef.current.slice(0, -1);
    futureRef.current = [...futureRef.current, currentSnapshot].slice(-maxHistory);

    isApplyingHistoryRef.current = true;
    lastSnapshotRef.current = cloneValue(previousSnapshot);
    lastSnapshotHashRef.current = getSnapshotHash(previousSnapshot);
    setNodes(cloneValue(previousSnapshot.nodes));
    setEdges(cloneValue(previousSnapshot.edges));
    refreshState();

    setTimeout(() => {
      isApplyingHistoryRef.current = false;
    }, 0);

    return true;
  }, [clearTimer, maxHistory, refreshState, setEdges, setNodes]);

  const redo = useCallback(() => {
    clearTimer();
    const nextSnapshot = futureRef.current[futureRef.current.length - 1];
    if (!nextSnapshot) return false;

    const currentSnapshot = createSnapshot(latestNodesRef.current, latestEdgesRef.current);
    futureRef.current = futureRef.current.slice(0, -1);
    pastRef.current = [...pastRef.current, currentSnapshot].slice(-maxHistory);

    isApplyingHistoryRef.current = true;
    lastSnapshotRef.current = cloneValue(nextSnapshot);
    lastSnapshotHashRef.current = getSnapshotHash(nextSnapshot);
    setNodes(cloneValue(nextSnapshot.nodes));
    setEdges(cloneValue(nextSnapshot.edges));
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
