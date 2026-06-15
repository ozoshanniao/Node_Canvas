import CustomSelect from '../CustomSelect';
import { useI18n } from '../../hooks/useI18n';

export function GeneralSettings({ settings, onSettingChange }) {
  const { t } = useI18n();

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="text-sm font-light text-white/85">{t('settings.language')}</div>
        <div className="mt-1 text-xs leading-5 text-white/35">{t('settings.language.desc')}</div>
        <CustomSelect
          value={settings.language || 'zh-CN'}
          onChange={(value) => onSettingChange('language', value)}
          options={[
            { value: 'zh-CN', label: t('settings.language.zhCN') },
            { value: 'en-US', label: t('settings.language.enUS') },
          ]}
          className="relative mt-3 w-full nodrag"
          buttonClassName="flex w-full items-center justify-between rounded-xl border border-white/10 bg-black/35 px-3 py-2.5 text-xs text-white/75 outline-none transition-colors hover:border-white/20 focus:border-white/35"
          menuClassName="nowheel nodrag absolute left-0 right-0 z-[100] mt-1.5 overflow-hidden rounded-xl border border-white/10 bg-[#141414]/95 shadow-2xl backdrop-blur-xl"
        />
      </section>

      <section className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-light text-white/85">{t('settings.developerMode')}</div>
            <div className="mt-1 text-xs leading-5 text-white/35">{t('settings.showRawCustomParams')}</div>
            <div className="mt-1 text-xs leading-5 text-white/25">{t('settings.showRawCustomParams.desc')}</div>
          </div>
          <button
            type="button"
            onClick={() => onSettingChange('showRawCustomParams', !settings.showRawCustomParams)}
            className={`mt-0.5 h-7 w-12 shrink-0 rounded-full border p-0.5 transition-colors ${
              settings.showRawCustomParams ? 'border-white/55 bg-white/85' : 'border-white/10 bg-black/30'
            }`}
            aria-label={t('settings.showRawCustomParams')}
            aria-pressed={settings.showRawCustomParams}
          >
            <span
              className={`block h-5 w-5 rounded-full transition-transform ${
                settings.showRawCustomParams ? 'translate-x-5 bg-black' : 'translate-x-0 bg-white/35'
              }`}
            />
          </button>
        </div>
      </section>
    </div>
  );
}
