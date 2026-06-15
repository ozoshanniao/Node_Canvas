import { useI18n } from '../../hooks/useI18n';

export function AboutSettings() {
  const { t } = useI18n();

  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
      <div className="text-lg font-light tracking-[0.04em] text-white/90">Node-AI-Canvas</div>
      <div className="mt-2 text-xs text-white/35">{t('settings.about.version')}</div>
      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-3 text-xs text-white/50">
          GitHub: {t('settings.about.placeholder')}
        </div>
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-3 text-xs text-white/50">
          License: {t('settings.about.placeholder')}
        </div>
      </div>
    </div>
  );
}
