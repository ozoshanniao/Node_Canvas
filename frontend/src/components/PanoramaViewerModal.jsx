import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../hooks/useI18n';
import { createPortal } from 'react-dom';
import { PanoramaViewerCanvas } from './PanoramaViewerCanvas';
import {
  PANORAMA_EXPORT_ASPECT_RATIOS,
  PANORAMA_EXPORT_RESOLUTIONS,
  resolvePanoramaExportSize,
} from '../utils/panoramaExportOptions';

const buttonClass =
  'rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs font-light text-white/70 transition-colors hover:bg-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-30';

const inputClass =
  'nodrag nopan h-8 rounded-full border border-white/10 bg-black/30 px-3 text-xs font-light text-white/70 outline-none transition-colors focus:border-white/25';

const formatAngle = (value) => `${Math.round(Number(value) || 0)}°`;
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const getModeFilePrefix = (mode) => (mode === 'panorama360' ? 'panorama360' : 'ar720');

const getCurrentCaptureFilename = (mode, viewerState) => {
  const prefix = getModeFilePrefix(mode);
  const yaw = Math.round(Number(viewerState?.yaw) || 0);
  const pitch = Math.round(Number(viewerState?.pitch) || 0);
  const fov = Math.round(Number(viewerState?.fov) || 70);

  if (mode === 'panorama360') {
    return `${prefix}_yaw${yaw}_fov${fov}.png`;
  }

  return `${prefix}_yaw${yaw}_pitch${pitch}_fov${fov}.png`;
};

const FOUR_VIEW_DEFINITIONS = [
  { label: 'Front', offset: 0 },
  { label: 'Right', offset: 90 },
  { label: 'Back', offset: 180 },
  { label: 'Left', offset: -90 },
];

const PRESET_VIEWS = {
  ar720: [
    { label: 'Front', yaw: 0, pitch: 0 },
    { label: 'Right', yaw: 90, pitch: 0 },
    { label: 'Back', yaw: 180, pitch: 0 },
    { label: 'Left', yaw: -90, pitch: 0 },
    { label: 'Up', yaw: 0, pitch: 75 },
    { label: 'Down', yaw: 0, pitch: -75 },
  ],
  panorama360: [
    { label: 'Front', yaw: 0, pitch: 0 },
    { label: 'Right', yaw: 90, pitch: 0 },
    { label: 'Back', yaw: 180, pitch: 0 },
    { label: 'Left', yaw: -90, pitch: 0 },
  ],
};

export function PanoramaViewerModal({
  open,
  title,
  imageUrl,
  projectPath,
  mode,
  viewerState,
  onViewerStateCommit,
  onCreateImageInput,
  onCreateImageInputs,
  onClose,
}) {
  const { t } = useI18n();
  const viewerRef = useRef(null);
  const [localViewerState, setLocalViewerState] = useState(viewerState ?? { yaw: 0, pitch: 0, fov: 70 });
  const [viewerReady, setViewerReady] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isCapturingFourViews, setIsCapturingFourViews] = useState(false);
  const [captureError, setCaptureError] = useState('');
  const [exportOptions, setExportOptions] = useState({
    aspectRatio: '16:9',
    resolution: '2K',
    customWidth: 1536,
    customHeight: 864,
    useCurrentHeadingAsFront: true,
    keepCurrentPitchIn4Views: true,
  });
  const [lockPitch, setLockPitch] = useState(mode === 'panorama360');

  const exportSize = useMemo(() => {
    try {
      return resolvePanoramaExportSize(exportOptions);
    } catch {
      return null;
    }
  }, [exportOptions]);
  const canCapture = Boolean(imageUrl && viewerReady && exportSize && !isCapturing && !isCapturingFourViews);
  const exportSizeLabel = exportSize ? `${exportSize.width} × ${exportSize.height}` : t('modal.panorama.invalidSize');
  const presetViews = PRESET_VIEWS[mode] || PRESET_VIEWS.ar720;

  const handleClose = () => {
    onViewerStateCommit?.(localViewerState);
    onClose();
  };

  const updateLocalViewerState = (patch) => {
    setLocalViewerState((current) => ({
      ...current,
      ...patch,
    }));
  };

  const updateExportOptions = (patch) => {
    setExportOptions((current) => ({
      ...current,
      ...patch,
    }));
  };

  const handleCaptureError = (error) => {
    console.error('[Panorama capture failed]', error);
    setCaptureError(
      error?.message?.includes('canvas export')
        ? t('modal.panorama.failedCaptureRemote')
        : error?.message || t('modal.panorama.failedCapture')
    );
  };

  const getCaptureSizeOrThrow = () => resolvePanoramaExportSize(exportOptions);

  const handleCaptureCurrentView = async () => {
    if (!canCapture || !viewerRef.current?.captureCurrentView) return;

    const currentView = {
      yaw: Number(localViewerState.yaw) || 0,
      pitch: Number(localViewerState.pitch) || 0,
      fov: Number(localViewerState.fov) || 70,
    };

    setIsCapturing(true);
    setCaptureError(t('modal.panorama.preparingCapture'));

    try {
      const size = getCaptureSizeOrThrow();
      const filename = getCurrentCaptureFilename(mode, currentView);
      const capture = await viewerRef.current.captureCurrentView({
        ...currentView,
        width: size.width,
        height: size.height,
        filename,
      });
      onCreateImageInput?.({
        ...capture,
        exportAspectRatio: exportOptions.aspectRatio,
        exportResolution: exportOptions.resolution,
      });
      setCaptureError('');
    } catch (error) {
      handleCaptureError(error);
    } finally {
      setIsCapturing(false);
    }
  };

  const handleCaptureFourViews = async () => {
    if (!canCapture || !viewerRef.current?.captureCurrentView) return;

    const currentView = {
      yaw: Number(localViewerState.yaw) || 0,
      pitch: Number(localViewerState.pitch) || 0,
      fov: Number(localViewerState.fov) || 70,
    };
    const anchorYaw = exportOptions.useCurrentHeadingAsFront ? currentView.yaw : 0;
    const anchorPitch = exportOptions.keepCurrentPitchIn4Views ? currentView.pitch : 0;

    setIsCapturingFourViews(true);
    setCaptureError(t('modal.panorama.preparing4Views'));

    try {
      const size = getCaptureSizeOrThrow();
      const prefix = getModeFilePrefix(mode);
      const captures = [];

      for (const view of FOUR_VIEW_DEFINITIONS) {
        const capture = await viewerRef.current.captureCurrentView({
          yaw: anchorYaw + view.offset,
          pitch: anchorPitch,
          fov: currentView.fov,
          width: size.width,
          height: size.height,
          filename: `${prefix}_${view.label.toLowerCase()}.png`,
        });
        captures.push({
          ...capture,
          label: view.label,
          exportAspectRatio: exportOptions.aspectRatio,
          exportResolution: exportOptions.resolution,
        });
      }

      onCreateImageInputs?.(captures);
      setCaptureError('');
    } catch (error) {
      handleCaptureError(error);
    } finally {
      setIsCapturingFourViews(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocalViewerState(viewerState ?? { yaw: 0, pitch: 0, fov: 70 });
    setViewerReady(false);
    setCaptureError('');
    setLockPitch(mode === 'panorama360');
  }, [imageUrl, mode, open]);

  useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') handleClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, localViewerState]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/75 p-6 text-white backdrop-blur-xl nodrag nopan"
      onMouseDown={(event) => event.stopPropagation()}
      onClick={handleClose}
    >
      <div
        className="relative flex h-[min(80vh,800px)] w-[min(86vw,1280px)] flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[#181818] shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex min-h-16 shrink-0 items-center justify-between gap-4 border-b border-white/10 px-6 py-3">
          <div>
            <div className="text-sm font-light text-white/80">{title}</div>
            <div className="text-[10px] font-light uppercase tracking-[0.22em] text-white/30">
              {t('modal.panorama.dragToLook')}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <button type="button" onClick={() => viewerRef.current?.reset?.()} className={buttonClass}>
              {t('modal.panorama.reset')}
            </button>
            <button type="button" onClick={() => viewerRef.current?.center?.()} className={buttonClass}>
              {t('modal.panorama.center')}
            </button>
            <button type="button" disabled={!canCapture} onClick={handleCaptureCurrentView} className={buttonClass}>
              {isCapturing ? t('modal.panorama.capturing') : t('modal.panorama.capture')}
            </button>
            <button type="button" disabled={!canCapture} onClick={handleCaptureFourViews} className={buttonClass}>
              {isCapturingFourViews ? t('modal.panorama.exporting4Views') : t('modal.panorama.fourViews')}
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="h-9 w-9 rounded-full border border-white/10 bg-white/5 text-white/45 transition-colors hover:bg-white/10 hover:text-white"
              aria-label={t('modal.panorama.closeViewer')}
            >
              x
            </button>
          </div>
        </div>

        <div className="grid shrink-0 grid-cols-1 gap-3 border-b border-white/10 bg-black/15 px-6 py-3 lg:grid-cols-[1fr_1.2fr]">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-[10px] font-light uppercase tracking-[0.16em] text-white/35">
              FOV
              <input
                type="range"
                min="35"
                max="110"
                value={Math.round(Number(localViewerState.fov) || 70)}
                onChange={(event) => updateLocalViewerState({ fov: clamp(Number(event.target.value), 35, 110) })}
                className="nodrag nopan w-36 accent-white"
              />
            </label>
            <input
              type="number"
              min="35"
              max="110"
              value={Math.round(Number(localViewerState.fov) || 70)}
              onChange={(event) => updateLocalViewerState({ fov: clamp(Number(event.target.value), 35, 110) })}
              className={`${inputClass} w-20`}
            />
            {mode === 'panorama360' && (
              <button
                type="button"
                onClick={() => setLockPitch((current) => !current)}
                className={`${buttonClass} ${lockPitch ? 'bg-white/20 text-white' : ''}`}
              >
                {lockPitch ? t('modal.panorama.pitchLocked') : t('modal.panorama.pitchLimited')}
              </button>
            )}
            <div className="flex flex-wrap items-center gap-1">
              {presetViews.map((view) => (
                <button
                  key={view.label}
                  type="button"
                  onClick={() => updateLocalViewerState({ yaw: view.yaw, pitch: view.pitch })}
                  className="nodrag nopan rounded-full border border-white/10 bg-black/25 px-2.5 py-1.5 text-[10px] font-light text-white/45 transition-colors hover:bg-white/10 hover:text-white/75"
                >
                  {t('preset.' + view.label.toLowerCase())}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-start gap-2 lg:justify-end">
            <select
              value={exportOptions.aspectRatio}
              onChange={(event) => updateExportOptions({ aspectRatio: event.target.value })}
              className={inputClass}
            >
              {PANORAMA_EXPORT_ASPECT_RATIOS.map((item) => (
                <option key={item} value={item} className="bg-[#181818]">
                  {item === 'Custom' ? t('modal.panorama.custom') : item}
                </option>
              ))}
            </select>
            <select
              value={exportOptions.resolution}
              onChange={(event) => updateExportOptions({ resolution: event.target.value })}
              className={inputClass}
            >
              {PANORAMA_EXPORT_RESOLUTIONS.map((item) => (
                <option key={item} value={item} className="bg-[#181818]">
                  {item === 'Custom' ? t('modal.panorama.custom') : item}
                </option>
              ))}
            </select>
            {(exportOptions.aspectRatio === 'Custom' || exportOptions.resolution === 'Custom') && (
              <>
                <input
                  type="number"
                  min="16"
                  step="16"
                  value={exportOptions.customWidth}
                  onChange={(event) => updateExportOptions({ customWidth: Number(event.target.value) })}
                  className={`${inputClass} w-24`}
                  aria-label={t('modal.panorama.exportWidth')}
                />
                <input
                  type="number"
                  min="16"
                  step="16"
                  value={exportOptions.customHeight}
                  onChange={(event) => updateExportOptions({ customHeight: Number(event.target.value) })}
                  className={`${inputClass} w-24`}
                  aria-label={t('modal.panorama.exportHeight')}
                />
              </>
            )}
            <label className="flex items-center gap-2 text-[10px] font-light uppercase tracking-[0.12em] text-white/40">
              <input
                type="checkbox"
                checked={exportOptions.useCurrentHeadingAsFront}
                onChange={(event) => updateExportOptions({ useCurrentHeadingAsFront: event.target.checked })}
              />
              {t('modal.panorama.currentFront')}
            </label>
            <label className="flex items-center gap-2 text-[10px] font-light uppercase tracking-[0.12em] text-white/40">
              <input
                type="checkbox"
                checked={exportOptions.keepCurrentPitchIn4Views}
                onChange={(event) => updateExportOptions({ keepCurrentPitchIn4Views: event.target.checked })}
              />
              {t('modal.panorama.keepPitch')}
            </label>
            <span className="rounded-full border border-white/10 bg-black/30 px-3 py-2 text-[10px] font-light uppercase tracking-[0.14em] text-white/35">
              {exportSizeLabel}
            </span>
          </div>
        </div>

        <div className="relative min-h-0 flex-1 overflow-hidden bg-black/40">
          {imageUrl ? (
            <>
              <PanoramaViewerCanvas
                ref={viewerRef}
                imageUrl={imageUrl}
                projectPath={projectPath}
                mode={mode}
                state={localViewerState}
                onStateChange={setLocalViewerState}
                onReadyChange={setViewerReady}
                lockPitch={lockPitch}
              />
              {captureError && (
                <div className="pointer-events-none absolute bottom-5 left-1/2 z-20 -translate-x-1/2 rounded-full border border-white/10 bg-black/70 px-4 py-2 text-xs font-light text-white/65 backdrop-blur-md">
                  {captureError}
                </div>
              )}
            </>
          ) : (
            <div className="flex h-full items-center justify-center text-sm font-light text-white/25">
              {t('modal.panorama.connectImage')}
            </div>
          )}
        </div>

        <div className="flex h-11 shrink-0 items-center gap-4 border-t border-white/10 px-6 text-[10px] font-light uppercase tracking-[0.18em] text-white/35">
          <span>Yaw {formatAngle(localViewerState.yaw)}</span>
          {mode === 'panorama360' ? (
            <span>{lockPitch ? t('modal.panorama.pitchLocked') : `Pitch ${formatAngle(localViewerState.pitch)}`}</span>
          ) : (
            <span>Pitch {formatAngle(localViewerState.pitch)}</span>
          )}
          <span>FOV {Math.round(Number(localViewerState.fov) || 70)}</span>
        </div>
      </div>
    </div>,
    document.body
  );
}
