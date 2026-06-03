import { useI18n } from '../hooks/useI18n';

export function TopProjectBar({ projectName, saveStatus, lastSavedAt, onSave }) {
  const { t } = useI18n();

  const statusText = (() => {
    if (saveStatus === 'saving') return t('topBar.saving');
    if (saveStatus === 'error') return t('topBar.saveFailed');
    if (saveStatus === 'saved') {
      return lastSavedAt
        ? `${t('topBar.saved')} ${lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
        : t('topBar.saved');
    }
    return '';
  })();

  return (
    <div
      className="absolute top-5 left-5 z-[120] flex items-center gap-2 rounded-full bg-[#121212]/75 border border-white/10 backdrop-blur-xl px-3 py-2 shadow-2xl text-white select-none"
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="max-w-[240px] truncate px-2 text-sm font-light text-white/75">
        {projectName || t('topBar.untitledProject')}
      </div>

      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onSave?.();
        }}
        disabled={saveStatus === 'saving'}
        className="nodrag nopan rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-light text-white/60 hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
      >
        {t('topBar.save')}
      </button>

      {statusText && (
        <div className={`pr-2 text-[10px] font-light ${saveStatus === 'error' ? 'text-red-300/70' : 'text-white/35'}`}>
          {statusText}
        </div>
      )}
    </div>
  );
}

