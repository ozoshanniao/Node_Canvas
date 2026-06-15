import CustomSelect from '../CustomSelect';
import { useI18n } from '../../hooks/useI18n';

export function StorageSettings({ settings, onSettingChange }) {
  const { t } = useI18n();

  return (
    <section className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="text-sm font-light text-white/85">{t('settings.publicAssetStorage')}</div>
      <div className="mt-1 text-xs leading-5 text-white/35">{t('settings.publicAssetStorage.desc')}</div>
      <CustomSelect
        value={settings.publicAssetStorage || ''}
        onChange={(value) => onSettingChange('publicAssetStorage', value)}
        options={[
          { value: '', label: t('settings.storage.envDefault') },
          { value: 'r2', label: t('settings.storage.r2') },
          { value: 'tos', label: t('settings.storage.tos') },
        ]}
        className="relative mt-3 w-full nodrag"
        buttonClassName="flex w-full items-center justify-between rounded-xl border border-white/10 bg-black/35 px-3 py-2.5 text-xs text-white/75 outline-none transition-colors hover:border-white/20 focus:border-white/35"
        menuClassName="nowheel nodrag absolute left-0 right-0 z-[100] mt-1.5 overflow-hidden rounded-xl border border-white/10 bg-[#141414]/95 shadow-2xl backdrop-blur-xl"
      />
    </section>
  );
}
