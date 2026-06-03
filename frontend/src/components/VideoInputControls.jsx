import { useState } from 'react';

export function VideoInputControls({ data, onApplyUrl }) {
  const currentUrl = data?.videoUrl || data?.url || '';
  const [draftUrl, setDraftUrl] = useState(currentUrl);

  return (
    <div className="nodrag nopan nowheel pointer-events-auto flex min-w-0 items-center gap-2 rounded-full border border-white/10 bg-black/35 px-2 py-1.5 text-white shadow-[0_16px_40px_rgba(0,0,0,0.28)] backdrop-blur-md">
      <span className="shrink-0 pl-1 text-[10px] font-light uppercase tracking-[0.16em] text-white/50">Video URL</span>
      <input
        type="text"
        value={draftUrl}
        onChange={(event) => setDraftUrl(event.target.value)}
        onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            onApplyUrl?.(draftUrl.trim());
          }
        }}
        placeholder="https://..."
        className="nodrag h-6 min-w-0 flex-1 rounded-full border border-white/10 bg-black/30 px-2 text-[11px] text-white/75 outline-none transition-colors placeholder:text-white/25 hover:border-white/20 focus:border-white/35"
      />
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onApplyUrl?.(draftUrl.trim());
        }}
        className="nodrag shrink-0 rounded-full border border-white/10 bg-white/[0.07] px-2.5 py-1 text-[10px] font-medium text-white/70 transition-colors hover:border-white/25 hover:bg-white/12 hover:text-white"
      >
        Apply
      </button>
    </div>
  );
}
