import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Handle, Position, useReactFlow, useUpdateNodeInternals } from '@xyflow/react';
import { NodeResizeCorner } from '../components/NodeResizeCorner';
import { isSupportedAudioFile, naturalCompareAudioFiles, SUPPORTED_AUDIO_EXTENSIONS } from '../utils/audioFiles';
import { formatAudioTime, getAudioPeaks, resamplePeaksForWidth } from '../utils/audioWaveform';
import { resolveImageUrl } from '../utils/resolveImageUrl';
import { uploadMediaToInput } from '../utils/uploadToInput';
import { countRender } from '../utils/perfDebug';

const MAX_WAVEFORM_BYTES = 40 * 1024 * 1024;
const DEFAULT_WIDTH = 280;
const DEFAULT_HEIGHT = 160;
const MIN_WIDTH = 220;
const MIN_HEIGHT = 120;

const getAudioDuration = (url) =>
  new Promise((resolve) => {
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      const duration = Number.isFinite(audio.duration) ? audio.duration : null;
      audio.src = '';
      resolve(duration);
    };
    audio.onerror = () => resolve(null);
    audio.src = url;
  });

const buildAudioFileMeta = (uploadResult, file, duration, folderPath = '') => ({
  sourceType: 'file',
  filePath: uploadResult.url,
  url: uploadResult.url,
  filename: file.name,
  mimeType: uploadResult.mimeType || file.type || '',
  size: uploadResult.bytes ?? file.size ?? null,
  duration,
  folderPath,
});

const clampIndex = (index, length) => {
  if (!length) return 0;
  const numericIndex = Number.isInteger(index) ? index : 0;
  return Math.min(Math.max(numericIndex, 0), length - 1);
};

export const AudioInputNode = memo(function AudioInputNode({ id, data }) {
  countRender('AudioInputNode');
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);
  const audioRef = useRef(null);
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const { setNodes } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [peaks, setPeaks] = useState([]);
  const [waveformError, setWaveformError] = useState(false);

  const audioFiles = useMemo(
    () => (Array.isArray(data?.audioFiles) ? data.audioFiles.filter((item) => item?.url) : []),
    [data?.audioFiles]
  );
  const currentIndex = clampIndex(data?.currentIndex, audioFiles.length);
  const currentAudio = audioFiles[currentIndex] || (data?.url ? data : null);
  const rawAudioUrl = currentAudio?.url || currentAudio?.filePath || '';
  const audioUrl = resolveImageUrl(rawAudioUrl, data?.projectPath);
  const duration = Number.isFinite(Number(currentAudio?.duration)) ? Number(currentAudio.duration) : 0;
  const hasMultiple = audioFiles.length > 1;
  const progress = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;

  const updateNodeData = useCallback((patch) => {
    setNodes((nds) =>
      nds.map((node) =>
        node.id === id
          ? {
              ...node,
              data: {
                ...node.data,
                ...patch,
              },
            }
          : node
      )
    );
  }, [id, setNodes]);

  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const pixelRatio = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    canvas.width = Math.floor(width * pixelRatio);
    canvas.height = Math.floor(height * pixelRatio);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const centerY = height / 2;
    const barWidth = 2;
    const gap = 1;
    const visiblePeaks = resamplePeaksForWidth(peaks, width, { barWidth, gap });

    if (!visiblePeaks.length) {
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.beginPath();
      ctx.moveTo(0, centerY);
      ctx.lineTo(width, centerY);
      ctx.stroke();
      return;
    }

    visiblePeaks.forEach((peak, index) => {
      const x = index * (barWidth + gap);
      const barHeight = Math.max(1, peak * (height - 6));
      const isElapsed = x / Math.max(1, width) <= progress;
      ctx.fillStyle = isElapsed ? 'rgba(255,255,255,0.78)' : 'rgba(255,255,255,0.20)';
      ctx.fillRect(x, centerY - barHeight / 2, barWidth, barHeight);
    });
  }, [peaks, progress]);

  useEffect(() => {
    drawWaveform();
  }, [drawWaveform]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => drawWaveform());
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [drawWaveform]);

  useEffect(() => {
    setCurrentTime(0);
    setIsPlaying(false);
    setPeaks([]);
    setWaveformError(false);

    if (!audioUrl || Number(currentAudio?.size || 0) > MAX_WAVEFORM_BYTES) return undefined;

    const controller = new AbortController();
    fetch(audioUrl, { signal: controller.signal })
      .then((response) => (response.ok ? response.arrayBuffer() : Promise.reject(new Error(response.statusText))))
      .then((buffer) => getAudioPeaks(buffer, { maxBytes: MAX_WAVEFORM_BYTES }))
      .then((nextPeaks) => {
        if (!controller.signal.aborted) setPeaks(nextPeaks);
      })
      .catch(() => {
        if (!controller.signal.aborted) setWaveformError(true);
      });

    return () => controller.abort();
  }, [audioUrl, currentAudio?.size]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return undefined;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime || 0);
    const handleDurationChange = () => {
      if (!Number.isFinite(audio.duration)) return;
      if (Math.abs((data?.duration || 0) - audio.duration) < 0.2) return;
      updateNodeData({ duration: audio.duration });
    };
    const handleEnded = () => setIsPlaying(false);
    const handlePause = () => setIsPlaying(false);
    const handlePlay = () => setIsPlaying(true);

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('durationchange', handleDurationChange);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('play', handlePlay);
    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('durationchange', handleDurationChange);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('play', handlePlay);
    };
  }, [data?.duration, updateNodeData]);

  const setCurrentIndex = useCallback((nextIndex) => {
    const index = clampIndex(nextIndex, audioFiles.length);
    const nextAudio = audioFiles[index];
    if (!nextAudio) return;
    updateNodeData({
      ...nextAudio,
      audioFiles,
      currentIndex: index,
    });
  }, [audioFiles, updateNodeData]);

  const handleFiles = useCallback(async (fileList) => {
    const files = Array.from(fileList || [])
      .filter(isSupportedAudioFile)
      .sort(naturalCompareAudioFiles);
    if (!files.length) return;

    const projectPath = data?.projectPath;
    if (!projectPath) {
      console.error('[AudioInputNode] projectPath not available for upload');
      return;
    }

    try {
      const uploaded = [];
      for (const file of files) {
        const result = await uploadMediaToInput(file, {
          projectPath,
          sourceKind: 'upload',
          filename: file.name,
          mimeType: file.type,
        });
        const resolvedUrl = resolveImageUrl(result.url, projectPath);
        const durationValue = await getAudioDuration(resolvedUrl);
        uploaded.push(buildAudioFileMeta(result, file, durationValue, file.webkitRelativePath?.split('/').slice(0, -1).join('/') || ''));
      }

      const first = uploaded[0];
      setNodes((nds) =>
        nds.map((node) =>
          node.id === id
            ? {
                ...node,
                width: node.width || DEFAULT_WIDTH,
                height: node.height || DEFAULT_HEIGHT,
                data: {
                  ...node.data,
                  ...first,
                  audioFiles: uploaded,
                  currentIndex: 0,
                  projectPath,
                },
              }
            : node
        )
      );
      requestAnimationFrame(() => updateNodeInternals(id));
    } catch (error) {
      console.error('[AudioInputNode] Upload failed:', error);
    }
  }, [data?.projectPath, id, setNodes, updateNodeInternals]);

  const handleFileChange = (event) => {
    handleFiles(event.target.files);
    event.target.value = '';
  };

  const handleDoubleClick = (event) => {
    event.stopPropagation();
    if (event.altKey) {
      folderInputRef.current?.click();
      return;
    }
    fileInputRef.current?.click();
  };

  const togglePlayback = (event) => {
    event.stopPropagation();
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;
    if (audio.paused) {
      audio.play().catch(() => setIsPlaying(false));
    } else {
      audio.pause();
    }
  };

  const seekFromPointer = (event) => {
    event.stopPropagation();
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / Math.max(1, rect.width)));
    audio.currentTime = ratio * duration;
    setCurrentTime(audio.currentTime);
  };

  return (
    // 外层容器不设 overflow-hidden，保证 Handle 和 NodeResizeCorner 可见
    <div
      ref={containerRef}
      onDoubleClick={handleDoubleClick}
      title="Double click to choose audio files. Alt+double click to choose a folder."
      className="canvas-node-card canvas-image-node-card group relative h-full min-h-[120px] w-full min-w-[220px] select-none rounded-[24px] border border-white/5 bg-[#181818] text-white transition-colors duration-100 hover:border-white/20"
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={SUPPORTED_AUDIO_EXTENSIONS.join(',')}
        onChange={handleFileChange}
        className="hidden"
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        webkitdirectory=""
        accept={SUPPORTED_AUDIO_EXTENSIONS.join(',')}
        onChange={handleFileChange}
        className="hidden"
      />
      <audio ref={audioRef} src={audioUrl || undefined} preload="metadata" className="hidden" />

      {/* 内容区：overflow-hidden + rounded-[24px] 放在内层，圆角剪裁不影响外部端口 */}
      <div className="absolute inset-0 flex flex-col overflow-hidden rounded-[24px]">
        <div className="absolute left-4 top-4 z-20 flex items-center gap-2 rounded-full border border-white/5 bg-[#121212]/60 px-3 py-1.5 text-[11px] font-light text-white/50 backdrop-blur-md pointer-events-none">
          <svg className="h-3.5 w-3.5 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 18V5l12-2v13" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
          </svg>
          <span>Audio Input</span>
        </div>

        {audioUrl ? (
          <div className="flex h-full min-h-0 flex-col px-4 pb-4 pt-14">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="min-w-0 truncate text-xs font-light text-white/70" title={currentAudio?.filename || ''}>
                {currentAudio?.filename || 'Audio'}
              </div>
              <div className="shrink-0 font-mono text-[10px] text-white/35">
                {formatAudioTime(currentTime)} / {formatAudioTime(duration)}
              </div>
            </div>

            <button
              type="button"
              onClick={seekFromPointer}
              className="nodrag nowheel min-h-0 flex-1 cursor-pointer rounded-[14px] border border-white/5 bg-black/20 p-2 transition-colors hover:border-white/10"
              aria-label="Seek audio waveform"
            >
              <canvas ref={canvasRef} className="block h-full w-full" />
            </button>

            <div className="mt-3 flex items-center gap-3">
              <button
                type="button"
                onClick={togglePlayback}
                className="nodrag flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/70 transition-colors hover:border-white/25 hover:bg-white/10 hover:text-white"
                aria-label={isPlaying ? 'Pause audio' : 'Play audio'}
              >
                {isPlaying ? (
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M7 5h3v14H7V5Zm7 0h3v14h-3V5Z" />
                  </svg>
                ) : (
                  <svg className="h-3.5 w-3.5 translate-x-px" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7L8 5Z" />
                  </svg>
                )}
              </button>

              <button
                type="button"
                onClick={seekFromPointer}
                className="nodrag h-1.5 flex-1 overflow-hidden rounded-full bg-white/10"
                aria-label="Seek audio progress"
              >
                <span className="block h-full rounded-full bg-white/70" style={{ width: `${progress * 100}%` }} />
              </button>

              {hasMultiple && (
                <div className="nodrag flex shrink-0 items-center gap-2 text-[11px] text-white/45">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setCurrentIndex((currentIndex - 1 + audioFiles.length) % audioFiles.length);
                    }}
                    className="rounded-full px-1.5 py-0.5 transition-colors hover:bg-white/5 hover:text-white"
                    aria-label="Previous audio"
                  >
                    ‹
                  </button>
                  <span className="font-mono">{currentIndex + 1}/{audioFiles.length}</span>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setCurrentIndex((currentIndex + 1) % audioFiles.length);
                    }}
                    className="rounded-full px-1.5 py-0.5 transition-colors hover:bg-white/5 hover:text-white"
                    aria-label="Next audio"
                  >
                    ›
                  </button>
                </div>
              )}
            </div>

            {waveformError && <span className="sr-only">Waveform unavailable</span>}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-white/20">
              <svg className="h-8 w-8 opacity-45" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.3} d="M9 18V5l12-2v13" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.3} d="M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.3} d="M21 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
              </svg>
              <div className="text-sm font-extralight tracking-wide">No audio</div>
            </div>
          </div>
        )}
      </div>

      {/* audio:out Handle 放在内容层外部，不受 overflow-hidden 影响 */}
      <Handle
        type="source"
        id="audio:out"
        position={Position.Right}
        className="!right-[-4px] !h-2 !w-2 !rounded-full !border !border-white/40 !bg-[#121212] transition-all group-hover:!border-white z-30"
      />

      {/* NodeResizeCorner 放在内容层外部，不受 overflow-hidden 影响 */}
      <NodeResizeCorner minWidth={MIN_WIDTH} minHeight={MIN_HEIGHT} />
    </div>
  );
});

