import { useCallback, useEffect, useRef } from 'react';
import {
  buildVideoTaskQueryInterruptedPatch,
  buildVideoTaskResumePatch,
  isVideoTaskActive,
} from '../utils/videoGenerationOptions';

const readJsonBody = async (response) => {
  try {
    return await response.json();
  } catch {
    return {};
  }
};

export const useVideoTask = ({ apiBaseUrl = 'http://127.0.0.1:8000', data, updateNodeData }) => {
  const pollingTimerRef = useRef(null);
  const pollingTaskIdRef = useRef('');
  const latestDataRef = useRef(data || {});

  useEffect(() => {
    latestDataRef.current = data || {};
  }, [data]);

  const setTask = useCallback((taskPatch) => {
    const currentData = latestDataRef.current || {};
    updateNodeData({
      task: {
        ...(currentData.task || {}),
        ...taskPatch,
      },
    });
  }, [updateNodeData]);

  const clearPolling = useCallback(() => {
    if (pollingTimerRef.current) {
      window.clearInterval(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }
    pollingTaskIdRef.current = '';
  }, []);

  const applyTaskResponse = useCallback((task) => {
    if (!task) return;
    const currentData = latestDataRef.current || {};
    updateNodeData({
      task: {
        ...(currentData.task || {}),
        ...task,
        status: task.status || currentData.task?.status || 'idle',
        progress: task.progress ?? currentData.task?.progress ?? 0,
        message: task.message || task.error || '',
        queuePosition: task.queuePosition ?? currentData.task?.queuePosition ?? 0,
      },
      outputs: {
        ...(currentData.outputs || {}),
        ...(task.outputs || {}),
        videoUrl: task.outputs?.videoUrl || task.localVideoUrl || currentData.outputs?.videoUrl || '',
      },
    });
  }, [updateNodeData]);

  const pollTask = useCallback(async (taskId) => {
    try {
      const currentData = latestDataRef.current || {};
      const projectPath = currentData.projectPath || window.currentProjectPath || '';
      const query = projectPath ? `?projectPath=${encodeURIComponent(projectPath)}` : '';
      const response = await fetch(`${apiBaseUrl}/api/video/tasks/${encodeURIComponent(taskId)}${query}`);
      const result = await readJsonBody(response);
      if (!response.ok) {
        throw new Error(result?.detail || `Video task query failed: ${response.status}`);
      }

      const task = result.data;
      applyTaskResponse(task);
      if (!isVideoTaskActive(task?.status)) {
        clearPolling();
      }
    } catch (error) {
      clearPolling();
      const currentTask = latestDataRef.current?.task || {};
      setTask(buildVideoTaskQueryInterruptedPatch(currentTask, error));
    }
  }, [apiBaseUrl, applyTaskResponse, clearPolling, setTask]);

  const startPolling = useCallback((taskId) => {
    if (!taskId) return;
    if (pollingTimerRef.current && pollingTaskIdRef.current === taskId) return;
    clearPolling();
    pollingTaskIdRef.current = taskId;
    pollTask(taskId);
    pollingTimerRef.current = window.setInterval(() => pollTask(taskId), 4000);
  }, [clearPolling, pollTask]);

  const startTask = useCallback(async (payload) => {
    clearPolling();
    setTask({
      status: 'submitting',
      progress: 0,
      message: 'Submitting video generation task...',
      error: '',
    });

    try {
      const response = await fetch(`${apiBaseUrl}/api/video/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await readJsonBody(response);
      if (!response.ok) {
        throw new Error(body?.detail || body?.message || `Video task submission failed: ${response.status}`);
      }

      const task = body?.data;
      if (!task?.id) {
        throw new Error('Video task response did not include a task id.');
      }

      applyTaskResponse(task);
      if (isVideoTaskActive(task.status)) {
        startPolling(task.id);
      }
      return { ok: true, task };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Video task submission failed.';
      clearPolling();
      setTask({
        status: 'error',
        progress: 0,
        message: errorMessage,
        error: errorMessage,
      });
      return { ok: false, error: errorMessage };
    }
  }, [apiBaseUrl, applyTaskResponse, clearPolling, setTask, startPolling]);

  const resumeTask = useCallback((taskId) => {
    const currentTask = latestDataRef.current?.task || {};
    const nextTaskId = taskId || currentTask.id;
    if (!nextTaskId) return;

    setTask(buildVideoTaskResumePatch({
      ...currentTask,
      id: nextTaskId,
    }));
    startPolling(nextTaskId);
  }, [setTask, startPolling]);

  useEffect(() => {
    const taskId = data?.task?.id;
    if (taskId && isVideoTaskActive(data?.task?.status)) {
      startPolling(taskId);
      return undefined;
    }
    clearPolling();
    return undefined;
  }, [clearPolling, data?.task?.id, data?.task?.status, startPolling]);

  useEffect(
    () => () => {
      clearPolling();
    },
    [clearPolling]
  );

  return {
    setTask,
    applyTaskResponse,
    pollTask,
    startTask,
    resumeTask,
    startPolling,
    clearPolling,
  };
};
