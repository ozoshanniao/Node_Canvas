export function GenerationPreviewOverlay({
  active,
  hasExistingPreview,
  label,
}) {
  if (!active) return null;

  return (
    <div
      className={`nodrag nopan nowheel absolute inset-0 z-10 flex items-center justify-center ${
        hasExistingPreview ? 'bg-black/55 backdrop-blur-[1px]' : 'bg-[#181818]/95'
      }`}
      aria-busy="true"
      aria-live="polite"
      role="status"
    >
      <div className="flex flex-col items-center gap-3 px-6 text-center text-white/75">
        <svg className="h-6 w-6 animate-spin" viewBox="0 0 24 24" aria-hidden="true">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        <span className="text-sm font-light">{label}</span>
      </div>
    </div>
  );
}