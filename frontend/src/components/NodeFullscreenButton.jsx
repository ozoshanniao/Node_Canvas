export function NodeFullscreenButton({ title = 'Open fullscreen editor', onClick }) {
  return (
    <button
      type="button"
      title={title}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick?.();
      }}
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      className="nodrag nopan w-6 h-6 rounded-md bg-white/5 border border-white/5 text-white/35 hover:text-white/80 hover:bg-white/10 hover:border-white/15 flex items-center justify-center transition-colors"
    >
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M8 3H3v5M16 3h5v5M8 21H3v-5M21 16v5h-5" />
      </svg>
    </button>
  );
}
