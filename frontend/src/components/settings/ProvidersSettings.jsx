import { useI18n } from '../../hooks/useI18n';

const PROVIDERS = ['DeepSeek', 'Google / Gemini / Veo', 'Yunwu', 'Kling', 'Seedance', 'Cloudflare R2'];

export function ProvidersSettings() {
  const { t } = useI18n();

  return (
    <div>
      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="text-sm font-light text-white/85">{t('settings.providers.placeholder')}</div>
        <div className="mt-2 max-w-xl text-xs leading-5 text-white/35">{t('settings.providers.security')}</div>
        <div className="mt-1 max-w-xl text-xs leading-5 text-white/35">{t('settings.providers.envPriority')}</div>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {PROVIDERS.map((provider) => (
          <div key={provider} className="rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-3 text-xs text-white/55">
            {provider}
          </div>
        ))}
      </div>
    </div>
  );
}
