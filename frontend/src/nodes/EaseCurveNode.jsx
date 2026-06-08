import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../hooks/useI18n';
import { Handle, Position, useEdges, useNodes, useReactFlow } from '@xyflow/react';
import { NodeResizeCorner } from '../components/NodeResizeCorner.jsx';
import { EaseCurveControls } from '../components/EaseCurveControls.jsx';
import {
  detectSpeedCurveEncoderSupport,
  EMPTY_EASE_CURVE_OUTPUT_FIELDS,
  persistOutputVideo,
  useApplySpeedCurve,
} from '../hooks/useApplySpeedCurve.js';
import { DEFAULT_EASE_CURVE_DATA, getEasingPresetHandles, normalizeEasingPresetId } from '../lib/easingPresets.js';
import { normalizeBezierHandles } from '../lib/easingFunctions.js';
import { getNodeEaseCurveOutput, getNodeVideoOutput } from '../utils/nodeOutputs.js';
import { resolveImageUrl } from '../utils/resolveImageUrl.js';
import { countRender } from '../utils/perfDebug.js';

const handleClass =
  '!h-2 !w-2 !rounded-full !border !border-white/40 !bg-[#121212] transition-all group-hover:!border-white';

const resolveMediaUrl = (url, projectPath) => {
  if (!url || typeof url !== 'string') return '';
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('blob:') || url.startsWith('data:')) {
    return url;
  }
  if (url.startsWith('/api/') || url.startsWith('input/') || url.startsWith('generation/')) {
    return resolveImageUrl(url, projectPath);
  }
  if (url.startsWith('/input/')) {
    return resolveImageUrl(url.slice(1), projectPath);
  }
  if (url.startsWith('/')) return `http://127.0.0.1:8000${url}`;
  return resolveImageUrl(url.replace(/^\.?\//, ''), projectPath);
};

const createRunRequestId = () =>
  globalThis.crypto?.randomUUID?.() || `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export const EaseCurveNode = memo(function EaseCurveNode({ id, data, selected }) {
  countRender('EaseCurveNode');
  const { t } = useI18n();
  const { setNodes } = useReactFlow();
  const flowEdges = useEdges();
  const flowNodes = useNodes();
  const applySpeedCurve = useApplySpeedCurve();
  const lastRunRequestRef = useRef(data?.runRequestId);
  const clearedMissingOutputRef = useRef(null);
  const [videoAspect, setVideoAspect] = useState(null);

  const mergedData = useMemo(
    () => ({
      ...DEFAULT_EASE_CURVE_DATA,
      ...(data || {}),
      bezierHandles: normalizeBezierHandles(data?.bezierHandles || DEFAULT_EASE_CURVE_DATA.bezierHandles),
    }),
    [data]
  );

  const incoming = useMemo(() => {
    const nodeMap = new Map(flowNodes.map((node) => [node.id, node]));
    const videoEdge = flowEdges.find(
      (edge) => edge.target === id && (edge.targetHandle ?? edge.targetHandleId) === 'video:in'
    );
    const curveEdge = flowEdges.find(
      (edge) => edge.target === id && (edge.targetHandle ?? edge.targetHandleId) === 'easeCurve:in'
    );
    const sourceVideoNode = videoEdge ? nodeMap.get(videoEdge.source) : null;
    const videos = videoEdge
      ? getNodeVideoOutput(sourceVideoNode, videoEdge.sourceHandle, videoEdge, flowNodes, flowEdges)
      : [];
    const curve = curveEdge
      ? getNodeEaseCurveOutput(nodeMap.get(curveEdge.source), curveEdge.sourceHandle, curveEdge, flowNodes, flowEdges)
      : null;
    return {
      sourceVideo: resolveMediaUrl(videos[0] || '', sourceVideoNode?.data?.projectPath || data?.projectPath),
      curve,
      curveSourceId: curveEdge?.source || null,
    };
  }, [data?.projectPath, flowEdges, flowNodes, id]);

  const updateData = useCallback(
    (patch) => {
      setNodes((nodes) =>
        nodes.map((node) =>
          node.id === id
            ? {
              ...node,
              data: {
                ...(node.data || {}),
                ...patch,
              },
            }
            : node
        )
      );
    },
    [id, setNodes]
  );

  useEffect(() => {
    if (!incoming.curve) {
      if (mergedData.inheritedFrom) updateData({ inheritedFrom: null });
      return;
    }
    const nextHandles = normalizeBezierHandles(incoming.curve.bezierHandles);
    const same =
      mergedData.inheritedFrom === incoming.curveSourceId &&
      JSON.stringify(mergedData.bezierHandles) === JSON.stringify(nextHandles) &&
      Number(mergedData.outputDuration) === Number(incoming.curve.outputDuration);
    if (same) return;
    updateData({
      bezierHandles: nextHandles,
      easingPreset: normalizeEasingPresetId(incoming.curve.easingPreset) || null,
      outputDuration: incoming.curve.outputDuration || mergedData.outputDuration,
      inheritedFrom: incoming.curveSourceId,
    });
  }, [incoming.curve, incoming.curveSourceId, mergedData.bezierHandles, mergedData.inheritedFrom, mergedData.outputDuration, updateData]);

  const handlePresetChange = useCallback(
    (presetId) => {
      const normalizedPresetId = normalizeEasingPresetId(presetId);
      const preset = getEasingPresetHandles(normalizedPresetId);
      if (!preset) {
        updateData({ easingPreset: null, error: null, dirty: true });
        return;
      }
      updateData({ easingPreset: normalizedPresetId, bezierHandles: preset, error: null, dirty: true });
    },
    [updateData]
  );

  const handleDurationChange = useCallback(
    (value) => {
      const duration = Math.max(0.25, Number(value) || 1.5);
      updateData({ outputDuration: duration });
    },
    [updateData]
  );

  const handleHandlesChange = useCallback(
    (handles) => updateData({ bezierHandles: normalizeBezierHandles(handles), easingPreset: null, dirty: true }),
    [updateData]
  );

  const handleApply = useCallback(async () => {
    const sourceVideo = incoming.sourceVideo;
    if (!sourceVideo) {
      updateData({
        ...EMPTY_EASE_CURVE_OUTPUT_FIELDS,
        status: 'error',
        error: t('node.easeCurve.error.noVideoInput'),
      });
      return;
    }

    try {
      const runRequestId = createRunRequestId();
      const projectPath = mergedData.projectPath || data?.projectPath || window.currentProjectPath || '';
      lastRunRequestRef.current = runRequestId;
      updateData({
        ...EMPTY_EASE_CURVE_OUTPUT_FIELDS,
        status: 'running',
        error: null,
        progress: 1,
        runRequestId,
        outputVideoWarning: null,
      });
      const support = await detectSpeedCurveEncoderSupport();
      const { blob, metadata } = await applySpeedCurve({
        sourceVideo,
        bezierHandles: mergedData.bezierHandles,
        outputDuration: mergedData.outputDuration,
        onProgress: (progress) => updateData({ progress }),
      });
      const persisted = await persistOutputVideo({
        blob,
        nodeId: id,
        projectPath,
        runRequestId,
      });
      updateData({
        status: 'done',
        error: null,
        progress: 100,
        runRequestId,
        encoderSupported: support,
        outputVideo: null,
        outputVideoPath: persisted.path,
        outputVideoUrl: persisted.url,
        videoUrl: persisted.path,
        base64Video: null,
        outputVideoWarning: persisted.warning,
        outputMetadata: metadata,
      });
    } catch (error) {
      updateData({
        ...EMPTY_EASE_CURVE_OUTPUT_FIELDS,
        status: 'error',
        error: error?.message || String(error),
        progress: 0,
      });
    }
  }, [applySpeedCurve, data, id, incoming.sourceVideo, mergedData.bezierHandles, mergedData.outputDuration, mergedData.projectPath, t, updateData]);

  useEffect(() => {
    if (!data?.runRequestId || data.runRequestId === lastRunRequestRef.current) return;
    lastRunRequestRef.current = data.runRequestId;
    handleApply();
  }, [data?.runRequestId, handleApply]);

  const isBusy = mergedData.status === 'running';
  const outputVideo = mergedData.outputVideoPath || mergedData.outputVideoUrl || mergedData.videoUrl || mergedData.outputVideo;
  const resolvedOutputVideo = resolveMediaUrl(outputVideo, mergedData.projectPath || data?.projectPath);
  const previewVideo = resolvedOutputVideo || incoming.sourceVideo;
  const isPreviewingPersistedOutput = Boolean(
    resolvedOutputVideo &&
    previewVideo === resolvedOutputVideo &&
    (mergedData.outputVideoPath || mergedData.outputVideoUrl || mergedData.videoUrl)
  );
  const panelOpen = Boolean(selected || mergedData.expanded);

  const activeVideoAspect = videoAspect?.src === previewVideo ? videoAspect.value : null;

  useEffect(() => {
    clearedMissingOutputRef.current = null;
  }, [resolvedOutputVideo]);

  const handleLoadedMetadata = useCallback((event) => {
    const video = event.currentTarget;
    if (video.videoWidth && video.videoHeight) {
      setVideoAspect({ src: previewVideo, value: video.videoWidth / video.videoHeight });
    }
  }, [previewVideo]);

  const handleVideoError = useCallback(() => {
    if (!isPreviewingPersistedOutput || !previewVideo) return;
    if (clearedMissingOutputRef.current === previewVideo) return;
    clearedMissingOutputRef.current = previewVideo;
    updateData({
      ...EMPTY_EASE_CURVE_OUTPUT_FIELDS,
      status: 'error',
      error: t('node.easeCurve.error.outputMissing'),
      progress: 0,
      outputVideoWarning: null,
    });
  }, [isPreviewingPersistedOutput, previewVideo, t, updateData]);

  return (
    <div className="relative h-full min-h-[240px] w-full min-w-[320px] select-none text-white group">
      <div className="canvas-node-card relative h-full w-full overflow-hidden rounded-[24px] border border-white/5 bg-[#181818] transition-colors duration-100 hover:border-white/20">
        <div className="pointer-events-none absolute left-4 top-4 z-20 flex items-center gap-2 rounded-full border border-white/5 bg-[#121212]/60 px-3 py-1.5 text-[11px] font-light text-white/55 backdrop-blur-md">
          <span className="h-1.5 w-1.5 rounded-full bg-white/45" />
          <span>{mergedData.label || t('node.easeCurve.label')}</span>
        </div>
        <PreviewStatusBadge status={mergedData.status} progress={mergedData.progress} />

        <div className="absolute inset-0">
          {previewVideo ? (
            <div className="relative flex h-full w-full items-center justify-center">
              <video
                className="h-full max-h-full w-full max-w-full object-contain"
                style={{ aspectRatio: activeVideoAspect || undefined }}
                src={previewVideo}
                autoPlay
                controls={Boolean(outputVideo)}
                loop
                muted
                playsInline
                onLoadedMetadata={handleLoadedMetadata}
                onError={handleVideoError}
              />
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
              <div className="text-xs font-light uppercase tracking-[0.18em] text-white/22">{t('node.easeCurve.preview')}</div>
              <div className="text-[11px] font-light text-white/35">{t('node.easeCurve.connectVideoInput')}</div>
            </div>
          )}

          {isBusy && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/55 backdrop-blur-sm">
              <div className="text-[11px] font-light uppercase tracking-[0.18em] text-white/65">{t('node.easeCurve.applying')}</div>
              <div className="h-1.5 w-32 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-white/65 transition-all"
                  style={{ width: `${Math.min(100, Math.max(0, Number(mergedData.progress) || 0))}%` }}
                />
              </div>
            </div>
          )}

          {mergedData.error && !isBusy && (
            <div className="absolute bottom-3 left-3 right-3 rounded-2xl border border-red-200/15 bg-red-950/35 px-3 py-2 text-[11px] leading-relaxed text-red-100/80 backdrop-blur-md">
              {mergedData.error}
            </div>
          )}
        </div>
      </div>

      {panelOpen && (
        <div className="nodrag nopan absolute left-[calc(100%+16px)] top-0 z-[80]">
          <EaseCurveControls
            data={mergedData}
            hasVideoInput={Boolean(incoming.sourceVideo)}
            inheritedFrom={incoming.curveSourceId}
            isBusy={isBusy}
            onApply={handleApply}
            onDurationChange={handleDurationChange}
            onHandlesChange={handleHandlesChange}
            onHandlesCommit={handleHandlesChange}
            onPresetChange={handlePresetChange}
          />
        </div>
      )}

      <PortLabel side="left" top="30%" label="Video" />
      <Handle
        type="target"
        id="video:in"
        position={Position.Left}
        className={`${handleClass} !left-[-5px] !top-[30%] !-translate-y-1/2`}
      />

      <PortLabel side="left" top="70%" label="Curve" />
      <Handle
        type="target"
        id="easeCurve:in"
        position={Position.Left}
        className={`${handleClass} !left-[-5px] !top-[70%] !-translate-y-1/2`}
      />

      <PortLabel side="right" top="35%" label="Video" />
      <Handle
        type="source"
        id="video:out"
        position={Position.Right}
        className={`${handleClass} !right-[-5px] !top-[35%] !-translate-y-1/2`}
      />

      <PortLabel side="right" top="70%" label="Curve" />
      <Handle
        type="source"
        id="easeCurve:out"
        position={Position.Right}
        className={`${handleClass} !right-[-5px] !top-[70%] !-translate-y-1/2`}
      />

      <NodeResizeCorner minWidth={320} minHeight={240} />
    </div>
  );
});

function PreviewStatusBadge({ status, progress }) {
  const { t } = useI18n();
  const normalized = status || 'idle';
  const label =
    normalized === 'running'
      ? t('node.easeCurve.status.loading', { progress: Math.round(Number(progress) || 0) })
      : normalized === 'done'
        ? t('node.easeCurve.status.complete')
        : normalized === 'error'
          ? t('node.easeCurve.status.error')
          : t('node.easeCurve.status.idle');
  const className =
    normalized === 'done'
      ? 'border-emerald-200/20 bg-emerald-300/10 text-emerald-100/75'
      : normalized === 'error'
        ? 'border-red-200/20 bg-red-300/10 text-red-100/80'
        : normalized === 'running'
          ? 'border-white/15 bg-white/10 text-white/75'
          : 'border-white/10 bg-black/25 text-white/45';

  return (
    <div className={`pointer-events-none absolute right-4 top-4 z-20 rounded-full border px-2.5 py-1.5 text-[9px] font-light uppercase tracking-[0.14em] backdrop-blur-md ${className}`}>
      {label}
    </div>
  );
}

function PortLabel({ side, top, label }) {
  const sideClass = side === 'left' ? 'left-3' : 'right-3';
  return (
    <div
      className={`pointer-events-none absolute ${sideClass} z-30 -translate-y-1/2 text-[10px] font-light text-white/40 opacity-0 transition-opacity group-hover:opacity-100`}
      style={{ top }}
    >
      {label}
    </div>
  );
}
