import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../hooks/useI18n';

export function FullscreenTextModal({
  open,
  title,
  subtitle,
  value,
  onChange,
  onClose,
  previewValue,
  previewTitle,
  mode = 'single',
  placeholder,
}) {
  const { t } = useI18n();
  const displayPreviewTitle = previewTitle ?? t('modal.fullscreenText.resolvedPreview');
  useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const isTemplatePreview = mode === 'template-preview';

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose?.();
        }
      }}
    >
      <section
        className="w-[min(80vw,1180px)] h-[78vh] bg-[#141414] border border-white/10 rounded-[24px] shadow-[0_30px_120px_rgba(0,0,0,0.65)] text-white flex flex-col overflow-hidden"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="h-14 px-5 border-b border-white/5 flex items-center justify-between shrink-0">
          <div className="min-w-0">
            <div className="text-sm text-white/85 font-light truncate">{title}</div>
            {subtitle && <div className="text-[10px] text-white/35 font-light truncate">{subtitle}</div>}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-md bg-white/5 border border-white/5 text-white/45 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div
          className={`flex-1 min-h-0 p-5 gap-4 ${
            isTemplatePreview
              ? 'grid grid-cols-[minmax(0,1fr)_minmax(320px,0.85fr)]'
              : 'flex flex-col'
          }`}
        >
          <div className="min-h-0 w-full flex-1 flex flex-col">
            {isTemplatePreview && <div className="text-[10px] uppercase tracking-wide text-white/35 mb-2">{t('modal.fullscreenText.template')}</div>}
            <textarea
              value={value}
              onChange={(event) => onChange?.(event.target.value)}
              placeholder={placeholder}
              autoFocus
              className="nodrag nowheel w-full flex-1 min-h-0 resize-none rounded-[16px] bg-black/20 border border-white/5 px-4 py-3 text-sm leading-relaxed text-white/90 placeholder-white/20 focus:outline-none focus:border-white/15"
            />
          </div>

          {isTemplatePreview && (
            <div className="min-h-0 flex flex-col">
              <div className="text-[10px] uppercase tracking-wide text-white/35 mb-2">{displayPreviewTitle}</div>
              <div className="nowheel flex-1 min-h-0 overflow-y-auto rounded-[16px] bg-black/20 border border-white/5 px-4 py-3 text-sm leading-relaxed text-white/75 whitespace-pre-wrap">
                {previewValue || <span className="text-white/25">{t('modal.fullscreenText.noResolvedText')}</span>}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>,
    document.body
  );
}
