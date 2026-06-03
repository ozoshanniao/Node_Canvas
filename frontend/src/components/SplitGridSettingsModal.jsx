import { useEffect, useState } from 'react';
import { useI18n } from '../hooks/useI18n';
import { SPLIT_GRID_PRESETS, getSplitGridCount } from '../utils/gridPresets';
import {
  fetchImageGenerationRegistry,
  getDefaultImageGenerationSettings,
  getImageAspectRatioOptions,
  getImageModelOptions,
  getImageProviderOptions,
  getImageResolutionOptions,
  normalizeImageGenerationSettings,
} from '../utils/imageGenerationOptions';

export function SplitGridSettingsModal({ open, data, onSave, onCreateSets, onClose }) {
  const { t } = useI18n();
  const [registry, setRegistry] = useState(null);
  const [layout, setLayout] = useState(data?.layout || '2x3');
  const [rows, setRows] = useState(data?.rows || 2);
  const [cols, setCols] = useState(data?.cols || 3);
  const [defaultPrompt, setDefaultPrompt] = useState(data?.defaultPrompt || '');
  const [generateSettings, setGenerateSettings] = useState(() =>
    normalizeImageGenerationSettings(data?.generateSettings || getDefaultImageGenerationSettings())
  );

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    const loadRegistry = async () => {
      try {
        const nextRegistry = await fetchImageGenerationRegistry();
        if (!cancelled) {
          setRegistry(nextRegistry);
        }
      } catch (error) {
        console.error('[SplitGridSettingsModal] failed to load image generation options', error);
      }
    };

    loadRegistry();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setLayout(data?.layout || '2x3');
    setRows(data?.rows || 2);
    setCols(data?.cols || 3);
    setDefaultPrompt(data?.defaultPrompt || '');
    setGenerateSettings(normalizeImageGenerationSettings(data?.generateSettings || getDefaultImageGenerationSettings(registry), registry));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [data, open, registry]);

  if (!open) return null;

  const providerOptions = getImageProviderOptions(registry);
  const modelOptions = getImageModelOptions(generateSettings.provider, registry);
  const aspectRatioOptions = getImageAspectRatioOptions(generateSettings.provider, generateSettings.model, registry);
  const resolutionOptions = getImageResolutionOptions(generateSettings.provider, generateSettings.model, registry);

  const updateProvider = (provider) => {
    setGenerateSettings(
      normalizeImageGenerationSettings(
        {
          provider,
          model: undefined,
          aspectRatio: undefined,
          ratio: undefined,
          resolution: undefined,
        },
        registry
      )
    );
  };

  const updateModel = (model) => {
    setGenerateSettings((current) =>
      normalizeImageGenerationSettings(
        {
          ...current,
          model,
        },
        registry
      )
    );
  };

  const updateGenerateSetting = (key, value) => {
    setGenerateSettings((current) =>
      normalizeImageGenerationSettings(
        {
          ...current,
          [key]: value,
          ...(key === 'aspectRatio' ? { ratio: value } : {}),
        },
        registry
      )
    );
  };

  const handlePresetClick = (preset) => {
    setLayout(preset.key);
    setRows(preset.rows);
    setCols(preset.cols);
  };

  const buildSettingsData = () => ({
      layout,
      rows,
      cols,
      defaultPrompt,
      generateSettings: normalizeImageGenerationSettings(generateSettings, registry),
      splitReady: true,
      settingsOpen: false,
    });

  const handleSave = () => {
    onSave(buildSettingsData());
  };

  const handleCreateSets = () => {
    if (getSplitGridCount(rows, cols) <= 0) return;
    onCreateSets?.(buildSettingsData());
  };

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm nodrag nopan"
      onMouseDown={(event) => event.stopPropagation()}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[560px] rounded-[22px] border border-white/10 bg-[#141414] p-5 text-white shadow-[0_25px_80px_rgba(0,0,0,0.75)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-light text-white/90">{t('modal.splitGrid.title')}</div>
            <div className="mt-1 text-xs font-light text-white/35">
              {t('modal.splitGrid.desc', { rows, cols, count: getSplitGridCount(rows, cols) })}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-light text-white/45 transition-colors hover:bg-white/5 hover:text-white/80"
          >
            {t('modal.splitGrid.close')}
          </button>
        </div>

        <div className="space-y-5">
          <section>
            <div className="mb-2 text-[11px] font-light uppercase tracking-[0.2em] text-white/35">
              {t('modal.splitGrid.layout')}
            </div>
            <div className="grid grid-cols-4 gap-2">
              {SPLIT_GRID_PRESETS.map((preset) => {
                const selected = preset.key === layout;
                return (
                  <button
                    key={preset.key}
                    type="button"
                    onClick={() => handlePresetClick(preset)}
                    className={`rounded-[12px] border px-3 py-2.5 text-left transition-colors ${
                      selected
                        ? 'border-white/30 bg-white/12 text-white'
                        : 'border-white/8 bg-white/[0.03] text-white/55 hover:border-white/18 hover:bg-white/[0.06] hover:text-white/80'
                    }`}
                  >
                    <div className="text-sm font-light">{preset.label}</div>
                    <div className="mt-0.5 text-[10px] font-light text-white/35">{t('modal.splitGrid.presetSlices', { count: preset.count })}</div>
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <div className="mb-2 text-[11px] font-light uppercase tracking-[0.2em] text-white/35">
              {t('modal.splitGrid.defaultPrompt')}
            </div>
            <textarea
              value={defaultPrompt}
              onChange={(event) => setDefaultPrompt(event.target.value)}
              placeholder={t('modal.splitGrid.defaultPromptPlaceholder')}
              className="nowheel h-24 w-full resize-none rounded-[14px] border border-white/10 bg-black/25 px-3 py-2.5 text-sm font-light leading-relaxed text-white/85 placeholder-white/20 outline-none transition-colors focus:border-white/25"
            />
          </section>

          <section>
            <div className="mb-2 text-[11px] font-light uppercase tracking-[0.2em] text-white/35">
              {t('modal.splitGrid.generateSettings')}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <SelectField
                label={t('modal.splitGrid.provider')}
                value={generateSettings.provider}
                options={providerOptions}
                onChange={updateProvider}
              />
              <SelectField
                label={t('modal.splitGrid.model')}
                value={generateSettings.model}
                options={modelOptions}
                onChange={updateModel}
              />
              <SelectField
                label={t('modal.splitGrid.aspectRatio')}
                value={generateSettings.aspectRatio}
                options={aspectRatioOptions}
                onChange={(value) => updateGenerateSetting('aspectRatio', value)}
              />
              <SelectField
                label={t('modal.splitGrid.resolution')}
                value={generateSettings.resolution}
                options={resolutionOptions}
                onChange={(value) => updateGenerateSetting('resolution', value)}
              />
            </div>
          </section>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/10 px-4 py-2 text-xs font-light text-white/45 transition-colors hover:bg-white/5 hover:text-white/80"
          >
            {t('modal.splitGrid.cancel')}
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="rounded-full border border-white/20 bg-white/12 px-5 py-2 text-xs font-light text-white/85 transition-colors hover:bg-white/18 hover:text-white"
          >
            {t('modal.splitGrid.save')}
          </button>
          <button
            type="button"
            onClick={handleCreateSets}
            disabled={getSplitGridCount(rows, cols) <= 0}
            className="rounded-full border border-white/25 bg-white px-5 py-2 text-xs font-light text-black transition-colors hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t('modal.splitGrid.createSets', { count: getSplitGridCount(rows, cols) })}
          </button>
        </div>
      </div>
    </div>
  );
}

function SelectField({ label, value, options, onChange }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10px] font-light uppercase tracking-[0.16em] text-white/30">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-[12px] border border-white/10 bg-black/25 px-3 py-2 text-sm font-light text-white/80 outline-none transition-colors focus:border-white/25"
      >
        {options.map((option) => (
          <option key={option.id || option} value={option.id || option} className="bg-[#141414] text-white">
            {option.label || option}
          </option>
        ))}
      </select>
    </label>
  );
}
