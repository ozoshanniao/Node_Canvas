import { useI18n } from '../../hooks/useI18n';
import {
  getColorPickerValue,
  getHexColorInputValue,
  updateHexColorAppSetting,
} from '../../utils/appSettings';

function ColorSetting({ label, settingKey, value, fallback, onChange }) {
  const normalizedValue = value || fallback;
  const colorPickerValue = getColorPickerValue(normalizedValue, fallback);

  return (
    <section className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="text-sm font-light text-white/85">{label}</div>
      <div className="mt-3 flex items-center overflow-hidden rounded-xl border border-white/10 bg-black/35 text-xs text-white/75 transition-colors focus-within:border-white/35 hover:border-white/20">
        <label className="relative flex h-10 w-11 shrink-0 cursor-pointer items-center justify-center border-r border-white/10" title={label}>
          <span
            className="h-5 w-5 rounded-md border border-white/20 shadow-[0_0_0_1px_rgba(0,0,0,0.35)]"
            style={{ backgroundColor: colorPickerValue }}
          />
          <input
            type="color"
            aria-label={label}
            value={colorPickerValue}
            onChange={(event) => updateHexColorAppSetting(onChange, settingKey, event.target.value)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </label>
        <span className="px-3 text-white/35">#</span>
        <input
          type="text"
          value={getHexColorInputValue(normalizedValue, fallback)}
          onChange={(event) => updateHexColorAppSetting(onChange, settingKey, event.target.value)}
          spellCheck={false}
          maxLength={6}
          className="min-w-0 flex-1 bg-transparent px-0 py-2.5 font-mono text-xs lowercase text-white/75 outline-none"
        />
      </div>
    </section>
  );
}

export function CanvasSettings({ settings, onSettingChange }) {
  const { t } = useI18n();

  return (
    <div className="grid gap-4">
      <ColorSetting
        label={t('settings.canvasBackgroundColor')}
        settingKey="canvasBackgroundColor"
        value={settings.canvasBackgroundColor}
        fallback="#0b0b0b"
        onChange={onSettingChange}
      />
      <ColorSetting
        label={t('settings.canvasGridColor')}
        settingKey="canvasGridColor"
        value={settings.canvasGridColor}
        fallback="#222222"
        onChange={onSettingChange}
      />
    </div>
  );
}
