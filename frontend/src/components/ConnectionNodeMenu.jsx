export function ConnectionNodeMenu({ x, y, groupedItems = {}, onSelect, onClose }) {
  const groups = Object.entries(groupedItems).filter(([, items]) => items.length > 0);

  return (
    <div
      style={{ top: `${y}px`, left: `${x}px` }}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      className="fixed z-[9999] w-[240px] rounded-[18px] border border-white/10 bg-[#141414]/95 p-3 shadow-2xl backdrop-blur-xl nodrag nopan select-none"
    >
      <div className="mb-2 flex items-center justify-between px-2">
        <div className="text-[11px] font-light uppercase tracking-[0.22em] text-white/35">Create Node</div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full px-2 py-1 text-xs text-white/30 transition-colors hover:bg-white/5 hover:text-white/70"
          aria-label="Close node menu"
        >
          x
        </button>
      </div>

      {groups.length > 0 ? (
        <div className="max-h-[320px] overflow-y-auto pr-1">
          {groups.map(([category, items]) => (
            <div key={category} className="mb-2 last:mb-0">
              <div className="px-2 pb-1 pt-2 text-[10px] font-light uppercase tracking-[0.18em] text-white/25">
                {category}
              </div>
              <div className="flex flex-col gap-1">
                {items.map((item) => (
                  <button
                    key={item.type}
                    type="button"
                    onClick={() => onSelect(item.type)}
                    className="flex w-full items-center justify-between rounded-[10px] px-3 py-2.5 text-left text-sm font-light text-white/55 transition-colors hover:bg-white/5 hover:text-white"
                  >
                    <span>{item.label}</span>
                    <span className="text-[10px] text-white/20">&gt;</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="px-3 py-5 text-center text-sm font-light text-white/25">No compatible nodes</div>
      )}
    </div>
  );
}
