import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { useI18n } from '../hooks/useI18n';
import { Handle, Position, useReactFlow, useUpdateNodeInternals } from '@xyflow/react';
import { NodeResizeCorner } from '../components/NodeResizeCorner.jsx';
import { resolveImageUrl } from '../utils/resolveImageUrl.js';
import { uploadMediaToInput } from '../utils/uploadToInput.js';
import {
  DEFAULT_VIDEO_INPUT_ASPECT_RATIO,
  DEFAULT_VIDEO_INPUT_SIZE,
  VIDEO_INPUT_SIZE_LIMITS,
  getAspectRatioFromDimensions,
  getVideoInputNodeSizeByAspectRatio,
} from '../utils/nodeSizing.js';
import { countRender } from '../utils/perfDebug.js';

const SUPPORTED_VIDEO_TYPES = 'video/mp4,video/webm,video/ogg,video/quicktime,video/x-msvideo,video/x-matroska,video/*';

const resolveVideoUrl = (url, projectPath) => {
  if (!url || typeof url !== 'string') return '';
  if (url.startsWith('data:video/') || url.startsWith('blob:') || url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  return resolveImageUrl(url, projectPath);
};

const readVideoMetadata = (videoUrl) =>
  new Promise((resolve) => {
    if (!videoUrl) {
      resolve(null);
      return;
    }

    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.onloadedmetadata = () => {
      const naturalWidth = video.videoWidth;
      const naturalHeight = video.videoHeight;
      video.removeAttribute('src');
      video.load();

      if (!Number.isFinite(naturalWidth) || !Number.isFinite(naturalHeight) || naturalWidth <= 0 || naturalHeight <= 0) {
        resolve(null);
        return;
      }

      resolve({
        naturalWidth,
        naturalHeight,
        aspectRatio: getAspectRatioFromDimensions(naturalWidth, naturalHeight),
      });
    };
    video.onerror = () => {
      video.removeAttribute('src');
      resolve(null);
    };
    video.src = videoUrl;
  });

function CapsuleUrlBar({ initialUrl, onApply }) {
  const { t } = useI18n();
  const [draftUrl, setDraftUrl] = useState(initialUrl);

  const handleApply = useCallback(() => {
    onApply?.(draftUrl.trim());
  }, [draftUrl, onApply]);

  return (
    <div
      className="nodrag nopan nowheel pointer-events-auto flex min-w-0 items-center gap-2 rounded-full border border-white/10 bg-[#181818] px-2 py-1.5 text-white shadow-[0_16px_40px_rgba(0,0,0,0.35)]"
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <span className="shrink-0 pl-1 text-[10px] font-light uppercase tracking-[0.16em] text-white/55">
        {t('node.videoInput.urlLabel')}
      </span>
      <input
        type="text"
        value={draftUrl}
        onChange={(event) => setDraftUrl(event.target.value)}
        onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            handleApply();
          }
        }}
        placeholder={t('node.videoInput.urlPlaceholder')}
        className="nodrag h-6 min-w-0 flex-1 rounded-full border border-white/10 bg-black/30 px-2 text-[11px] text-white/75 outline-none transition-colors placeholder:text-white/25 hover:border-white/20 focus:border-white/35"
      />
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          handleApply();
        }}
        className="nodrag shrink-0 rounded-full border border-white/10 bg-white/[0.07] px-2.5 py-1 text-[10px] font-medium text-white/70 transition-colors hover:border-white/25 hover:bg-white/12 hover:text-white"
      >
        {t('node.videoInput.apply')}
      </button>
    </div>
  );
}

export const VideoInputNode = memo(function VideoInputNode({ id, data, selected }) {
  countRender('VideoInputNode');
  const { t } = useI18n();
  const fileInputRef = useRef(null);
  const { setNodes } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const showCapsule = Boolean(selected);
  const persistedVideoUrl = data?.videoUrl || data?.url || data?.filePath || '';
  const previewUrl = useMemo(
    () => resolveVideoUrl(persistedVideoUrl, data?.projectPath),
    [data?.projectPath, persistedVideoUrl]
  );

  const updateNodeData = useCallback(
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

  const applyVideoMetadata = useCallback(
    ({ naturalWidth, naturalHeight }) => {
      const aspectRatio = getAspectRatioFromDimensions(naturalWidth, naturalHeight);

      setNodes((nodes) =>
        nodes.map((node) => {
          if (node.id !== id) return node;

          const nextSize = getVideoInputNodeSizeByAspectRatio(aspectRatio, {
            width: node.width || DEFAULT_VIDEO_INPUT_SIZE.width,
          });
          const dataChanged =
            node.data?.naturalWidth !== naturalWidth ||
            node.data?.naturalHeight !== naturalHeight ||
            node.data?.aspectRatio !== aspectRatio;
          const sizeChanged =
            Math.abs((node.width || 0) - nextSize.width) > 1 ||
            Math.abs((node.height || 0) - nextSize.height) > 1;

          if (!dataChanged && !sizeChanged) return node;

          return {
            ...node,
            ...(sizeChanged ? nextSize : {}),
            data: {
              ...(node.data || {}),
              naturalWidth,
              naturalHeight,
              aspectRatio,
            },
          };
        })
      );
      requestAnimationFrame(() => updateNodeInternals(id));
      return aspectRatio;
    },
    [id, setNodes, updateNodeInternals]
  );

  const handleLoadedMetadata = useCallback(
    (event) => {
      const naturalWidth = event.currentTarget.videoWidth;
      const naturalHeight = event.currentTarget.videoHeight;
      if (!naturalWidth || !naturalHeight) return;
      applyVideoMetadata({ naturalWidth, naturalHeight });
    },
    [applyVideoMetadata]
  );

  const handleApplyUrl = useCallback(
    (url) => {
      updateNodeData({
        videoFile: null,
        videoUrl: url,
        url,
        filePath: url,
        filename: '',
        mimeType: '',
        naturalWidth: null,
        naturalHeight: null,
        aspectRatio: DEFAULT_VIDEO_INPUT_ASPECT_RATIO,
        sourceKind: url ? 'url' : '',
      });
      requestAnimationFrame(() => updateNodeInternals(id));
    },
    [id, updateNodeData, updateNodeInternals]
  );

  const handleFileChange = useCallback(
    async (event) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;

      const projectPath = data?.projectPath;
      if (!projectPath) {
        console.error('[VideoInputNode] projectPath not available for upload');
        return;
      }

      let blobPreviewUrl = '';
      let uploaded = false;
      try {
        blobPreviewUrl = URL.createObjectURL(file);
        const metadata = await readVideoMetadata(blobPreviewUrl);
        const aspectRatio = metadata?.aspectRatio || DEFAULT_VIDEO_INPUT_ASPECT_RATIO;

        updateNodeData({
          videoFile: null,
          videoUrl: blobPreviewUrl,
          url: blobPreviewUrl,
          filePath: blobPreviewUrl,
          filename: file.name,
          mimeType: file.type,
          naturalWidth: metadata?.naturalWidth || null,
          naturalHeight: metadata?.naturalHeight || null,
          aspectRatio,
          sourceKind: 'upload',
        });

        if (metadata) {
          applyVideoMetadata(metadata);
        }

        const result = await uploadMediaToInput(file, {
          projectPath,
          sourceKind: 'upload',
          filename: file.name,
          mimeType: file.type,
        });

        updateNodeData({
          videoFile: null,
          videoUrl: result.url,
          url: result.url,
          filePath: result.url,
          filename: result.filename || file.name,
          mimeType: result.mimeType || file.type,
          bytes: result.bytes ?? file.size ?? null,
          naturalWidth: metadata?.naturalWidth || null,
          naturalHeight: metadata?.naturalHeight || null,
          aspectRatio,
          sourceKind: 'upload',
        });
        uploaded = true;
        requestAnimationFrame(() => updateNodeInternals(id));
      } catch (error) {
        console.error('[VideoInputNode] Upload failed:', error);
      } finally {
        if (blobPreviewUrl && uploaded) URL.revokeObjectURL(blobPreviewUrl);
      }
    },
    [applyVideoMetadata, data?.projectPath, id, updateNodeData, updateNodeInternals]
  );

  const handleDoubleClick = useCallback((event) => {
    event.stopPropagation();
    fileInputRef.current?.click();
  }, []);

  return (
    <div
      onDoubleClick={handleDoubleClick}
      title={t('node.videoInput.uploadTitle')}
      className="canvas-node-card group relative h-full min-h-[120px] w-full min-w-[220px] select-none rounded-[24px] border border-white/5 bg-[#181818] text-white transition-colors duration-100 hover:border-white/20"
    >
      <input
        ref={fileInputRef}
        type="file"
        accept={SUPPORTED_VIDEO_TYPES}
        onChange={handleFileChange}
        className="hidden"
      />

      <div
        className={[
          'nodrag nopan',
          'absolute -top-14 left-1/2 z-[80] flex -translate-x-1/2 items-center whitespace-nowrap',
          "before:absolute before:left-0 before:top-full before:h-14 before:w-full before:content-['']",
          showCapsule
            ? 'pointer-events-auto opacity-100'
            : 'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100',
          'transition-opacity duration-200',
        ].join(' ')}
        onPointerDown={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <CapsuleUrlBar key={persistedVideoUrl} initialUrl={persistedVideoUrl} onApply={handleApplyUrl} />
      </div>

      <div className="pointer-events-none absolute left-4 top-4 z-20 flex items-center gap-2 rounded-full border border-white/5 bg-[#121212]/60 px-3 py-1.5 text-[11px] font-light text-white/50 backdrop-blur-md">
        <svg className="h-3 w-3 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
          />
        </svg>
        <span>{t('node.videoInput.label')}</span>
      </div>

      <div className="absolute inset-0 flex items-center justify-center overflow-hidden rounded-[24px] bg-[#181818]">
        {previewUrl ? (
          <video
            src={previewUrl}
            className="absolute inset-0 h-full w-full object-cover"
            controls
            loop
            muted
            playsInline
            onLoadedMetadata={handleLoadedMetadata}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-white/20">
            <svg className="h-8 w-8 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.3}
                d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
            <span className="text-sm font-extralight tracking-wide">{t('node.videoInput.doubleClickToUpload')}</span>
          </div>
        )}
      </div>

      <div className="absolute left-0 z-20 flex items-center" style={{ top: '50%' }}>
        <Handle
          type="target"
          id="video:in"
          position={Position.Left}
          className="!left-[-4px] !h-2 !w-2 !rounded-full !border !border-white/40 !bg-[#121212] transition-all group-hover:!border-white"
        />
        <span className="pointer-events-none absolute left-4 whitespace-nowrap rounded bg-[#181818] px-1 text-[11px] font-light text-white/40 opacity-0 transition-opacity group-hover:opacity-100">
          video:in
        </span>
      </div>

      <div className="absolute right-0 z-20 flex items-center" style={{ top: '50%' }}>
        <span className="pointer-events-none absolute right-4 whitespace-nowrap rounded bg-[#181818] px-1 text-[11px] font-light text-white/40 opacity-0 transition-opacity group-hover:opacity-100">
          video:out
        </span>
        <Handle
          type="source"
          id="video:out"
          position={Position.Right}
          className="!right-[-4px] !h-2 !w-2 !rounded-full !border !border-white/40 !bg-[#121212] shadow-[0_0_8px_rgba(255,255,255,0.2)] transition-all group-hover:!border-white"
        />
      </div>

      <NodeResizeCorner minWidth={VIDEO_INPUT_SIZE_LIMITS.minWidth} minHeight={VIDEO_INPUT_SIZE_LIMITS.minHeight} keepAspectRatio />
    </div>
  );
});
