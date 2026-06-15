import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../hooks/useI18n';
import { AboutSettings } from './AboutSettings';
import { CanvasSettings } from './CanvasSettings';
import { GeneralSettings } from './GeneralSettings';
import { ProvidersSettings } from './ProvidersSettings';
import { SettingsSidebar } from './SettingsSidebar';
import { StorageSettings } from './StorageSettings';

export function SettingsModal({ open, settings, onSettingChange, onClose }) {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState('general');
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    dialogRef.current?.focus();

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onClose, open]);

  if (!open) return null;

  const tabs = [
    { id: 'general', label: t('settings.tab.general') },
    { id: 'canvas', label: t('settings.tab.canvas') },
    { id: 'storage', label: t('settings.tab.storage') },
    { id: 'providers', label: t('settings.tab.providers') },
    { id: 'about', label: t('settings.tab.about') },
  ];

  const content = {
    general: <GeneralSettings settings={settings} onSettingChange={onSettingChange} />,
    canvas: <CanvasSettings settings={settings} onSettingChange={onSettingChange} />,
    storage: <StorageSettings settings={settings} onSettingChange={onSettingChange} />,
    providers: <ProvidersSettings />,
    about: <AboutSettings />,
  };

  return (
    <div
      className="nodrag nopan nowheel fixed inset-0 z-[10000] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
      onClick={onClose}
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
        tabIndex={-1}
        className="flex h-[min(640px,calc(100vh-32px))] w-full max-w-[920px] flex-col overflow-hidden rounded-[24px] border border-white/10 bg-[#141414] text-white shadow-[0_30px_100px_rgba(0,0,0,0.8)] outline-none md:flex-row"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <SettingsSidebar tabs={tabs} activeTab={activeTab} onChange={setActiveTab} label={t('settings.categories')} />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="flex shrink-0 items-center justify-between border-b border-white/5 px-5 py-4 sm:px-7">
            <div>
              <div id="settings-modal-title" className="text-sm font-light tracking-[0.08em] text-white/90">
                {t('settings.title')}
              </div>
              <div className="mt-1 text-xs font-light text-white/30">
                {tabs.find((tab) => tab.id === activeTab)?.label}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 text-xs text-white/45 transition-colors hover:bg-white/5 hover:text-white/85"
              aria-label={t('settings.close')}
              title={t('settings.close')}
            >
              X
            </button>
          </header>
          <main className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-7">{content[activeTab]}</main>
        </div>
      </div>
    </div>
  );
}
