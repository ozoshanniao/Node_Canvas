import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../hooks/useI18n';
import { CubicBezierEditor } from './CubicBezierEditor.jsx';
import { EASING_PRESET_OPTIONS } from '../lib/easingPresets.js';
import { generateEasingPolyline } from '../lib/easingFunctions.js';

export function EaseCurveControls({
  data,
  hasVideoInput,
  inheritedFrom,
  isBusy,
  onApply,
  onDurationChange,
  onHandlesChange,
  onHandlesCommit,
  onPresetChange,
}) {
  const { t } = useI18n();
  const presetRef = useRef(null);
  const [presetOpen, setPresetOpen] = useState(false);
  const status = data?.status || 'idle';
  const progress = Number.isFinite(Number(data?.progress)) ? Number(data.progress) : 0;
  const activePreset = useMemo(
    () => EASING_PRESET_OPTIONS.find((preset) => preset.id === data?.easingPreset) || null,
    [data?.easingPreset]
  );

  useEffect(() => {
    if (!presetOpen) return undefined;

    const handlePointerDown = (event) => {
      if (!presetRef.current?.contains(event.target)) {
        setPresetOpen(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [presetOpen]);

  const handlePresetSelect = (presetId) => {
    onPresetChange(presetId);
    setPresetOpen(false);
  };

  return (
    <div className="nodrag nopan nowheel flex w-[340px] flex-col gap-3 rounded-[24px] border border-white/10 bg-[#181818]/95 p-4 text-white shadow-[0_28px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] font-light uppercase tracking-[0.18em] text-white/35">{t('controls.easeCurve.title')}</div>
        <StatusPill status={status} progress={progress} />
      </div>

      <div className="grid grid-cols-[1fr_92px] gap-2">
        <div ref={presetRef} className="relative">
          <span className="mb-1 block text-[10px] font-light uppercase tracking-[0.14em] text-white/30">{t('controls.easeCurve.preset')}</span>
          <button
            type="button"
            disabled={Boolean(inheritedFrom) || isBusy}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setPresetOpen((value) => !value);
            }}
            className="nodrag nopan flex w-full items-center justify-between rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-left text-xs text-white/75 outline-none transition-colors hover:border-white/20 focus:border-white/35 disabled:opacity-45"
          >
            <span className="truncate">{activePreset ? t('preset.' + activePreset.id) : t('controls.easeCurve.custom')}</span>
            <span className="text-white/35">v</span>
          </button>

          {presetOpen && (
            <div className="nodrag nopan nowheel absolute left-0 top-full z-[90] mt-2 w-[420px] rounded-2xl border border-white/10 bg-[#121212]/98 p-2 shadow-2xl backdrop-blur-xl">
              <div className="grid max-h-[360px] grid-cols-2 gap-2 overflow-y-auto pr-1">
                {EASING_PRESET_OPTIONS.map((preset) => (
                  <PresetOption
                    key={preset.id}
                    preset={preset}
                    selected={preset.id === data?.easingPreset}
                    onSelect={() => handlePresetSelect(preset.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        <label className="block">
          <span className="mb-1 block text-[10px] font-light uppercase tracking-[0.14em] text-white/30">{t('controls.easeCurve.duration')}</span>
          <input
            type="number"
            min="0.25"
            step="0.25"
            value={data?.outputDuration ?? 1.5}
            disabled={Boolean(inheritedFrom) || isBusy}
            onChange={(event) => onDurationChange(event.target.value)}
            className="nodrag w-full rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-xs text-white/75 outline-none transition-colors hover:border-white/20 focus:border-white/35 disabled:opacity-45"
          />
        </label>
      </div>

      <CubicBezierEditor
        handles={data?.bezierHandles}
        disabled={Boolean(inheritedFrom) || isBusy}
        onChange={onHandlesChange}
        onCommit={onHandlesCommit}
      />

      <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="text-white/45">{t('controls.easeCurve.videoInput')}</span>
          <span className={hasVideoInput ? 'text-white/75' : 'text-white/35'}>
            {hasVideoInput ? t('controls.easeCurve.connected') : t('controls.easeCurve.required')}
          </span>
        </div>
        {data?.outputVideoWarning && (
          <div className="mt-2 text-[11px] leading-relaxed text-amber-200/75">{data.outputVideoWarning}</div>
        )}
        {data?.error && (
          <div className="mt-2 text-[11px] leading-relaxed text-red-200/80">{data.error}</div>
        )}
      </div>

      <button
        type="button"
        disabled={!hasVideoInput || isBusy}
        onClick={onApply}
        className="nodrag mt-auto rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs font-medium text-white/80 transition-colors hover:border-white/25 hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {isBusy ? t('controls.easeCurve.applying', { progress: Math.round(progress) }) : t('controls.easeCurve.apply')}
      </button>
    </div>
  );
}

function PresetOption({ preset, selected, onSelect }) {
  const { t } = useI18n();
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onSelect();
      }}
      className={`nodrag nopan rounded-xl border p-2 text-left transition-colors ${
        selected
          ? 'border-white/35 bg-white/[0.12] text-white'
          : 'border-white/[0.08] bg-black/25 text-white/60 hover:border-white/[0.18] hover:bg-white/[0.07] hover:text-white/85'
      }`}
    >
      <div className="mb-2 flex h-14 items-center justify-center overflow-hidden rounded-lg border border-white/[0.08] bg-black/35">
        {!imageFailed ? (
          <img
            src={preset.image}
            alt=""
            className="h-full w-full object-cover"
            onError={() => setImageFailed(true)}
            draggable={false}
          />
        ) : (
          <PresetSvgPreview handles={preset.handles} />
        )}
      </div>
      <div className="truncate text-[11px] font-medium">{t('preset.' + preset.id)}</div>
    </button>
  );
}

function PresetSvgPreview({ handles }) {
  const handleObject = {
    x1: handles[0],
    y1: handles[1],
    x2: handles[2],
    y2: handles[3],
  };
  const points = generateEasingPolyline(handleObject, 28)
    .map((point) => `${(point.x * 100).toFixed(2)},${((1 - point.y) * 100).toFixed(2)}`)
    .join(' ');

  return (
    <svg className="h-full w-full p-2" viewBox="0 0 100 100" aria-hidden="true">
      <path d="M0 100H100M0 50H100M0 0H100M0 0V100M50 0V100M100 0V100" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
      <polyline points={points} fill="none" stroke="rgba(255,255,255,0.82)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function StatusPill({ status, progress }) {
  const { t } = useI18n();
  const label = status === 'running' ? `${Math.round(progress)}%` : status === 'done' ? t('controls.easeCurve.status.ready') : status === 'error' ? t('controls.easeCurve.status.error') : t('controls.easeCurve.status.idle');
  const className =
    status === 'done'
      ? 'border-emerald-200/20 bg-emerald-300/10 text-emerald-100/75'
      : status === 'error'
        ? 'border-red-200/20 bg-red-300/10 text-red-100/80'
        : status === 'running'
          ? 'border-white/15 bg-white/10 text-white/75'
          : 'border-white/10 bg-black/25 text-white/40';

  return (
    <div className={`rounded-full border px-2.5 py-1 text-[10px] font-light uppercase tracking-[0.14em] ${className}`}>
      {label}
    </div>
  );
}
