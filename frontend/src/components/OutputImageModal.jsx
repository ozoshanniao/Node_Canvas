import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { resolveImageUrl } from '../utils/resolveImageUrl';

export function OutputImageModal({
  open,
  images = [],
  selectedIndex = 0,
  onSelectIndex,
  onClose,
  onUseAsImageInput,
}) {
  const imageCount = images.length;
  const selectedUrl = images[selectedIndex];
  const resolvedSelectedUrl = resolveImageUrl(selectedUrl);

  useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowLeft' && imageCount > 1) {
        onSelectIndex((selectedIndex - 1 + imageCount) % imageCount);
      }
      if (event.key === 'ArrowRight' && imageCount > 1) {
        onSelectIndex((selectedIndex + 1) % imageCount);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [imageCount, onClose, onSelectIndex, open, selectedIndex]);

  if (!open) return null;
  if (typeof document === 'undefined') return null;

  const goPrevious = () => {
    if (imageCount <= 1) return;
    onSelectIndex((selectedIndex - 1 + imageCount) % imageCount);
  };

  const goNext = () => {
    if (imageCount <= 1) return;
    onSelectIndex((selectedIndex + 1) % imageCount);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] bg-black/75 backdrop-blur-xl flex items-center justify-center p-6 nodrag nopan"
      onMouseDown={(event) => event.stopPropagation()}
      onClick={onClose}
    >
      <div
        className="relative w-[min(94vw,1000px)] h-[min(84vh,760px)] rounded-[28px] border border-white/10 bg-[#181818] shadow-2xl text-white flex flex-col overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="h-16 shrink-0 flex items-center justify-between gap-4 px-6 border-b border-white/10">
          <div>
            <div className="text-sm font-light text-white/80">Output</div>
            <div className="text-[10px] font-light uppercase tracking-[0.22em] text-white/30">
              {imageCount ? `${selectedIndex + 1} / ${imageCount}` : 'No Image'}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!selectedUrl}
              onClick={(event) => {
                event.stopPropagation();
                selectedUrl && onUseAsImageInput(selectedUrl);
              }}
              className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs font-light text-white/70 transition-colors hover:bg-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
            >
              Use as Image Input
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onClose();
              }}
              className="h-9 w-9 rounded-full border border-white/10 bg-white/5 text-white/45 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Close output preview"
            >
              x
            </button>
          </div>
        </div>

        <div className="relative flex-1 min-h-0 flex items-center justify-center bg-black/20 p-4 overflow-hidden">
          {resolvedSelectedUrl ? (
            <img
              src={resolvedSelectedUrl}
              alt="Selected output"
              draggable={false}
              className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl select-none"
            />
          ) : (
            <div className="text-sm font-light text-white/25">No image connected</div>
          )}

          {imageCount > 1 && (
            <>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  goPrevious();
                }}
                className="absolute left-6 top-1/2 h-12 w-12 -translate-y-1/2 rounded-full border border-white/10 bg-white/10 text-white/70 transition-colors hover:bg-white/20 hover:text-white"
                aria-label="Previous image"
              >
                &lt;
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  goNext();
                }}
                className="absolute right-6 top-1/2 h-12 w-12 -translate-y-1/2 rounded-full border border-white/10 bg-white/10 text-white/70 transition-colors hover:bg-white/20 hover:text-white"
                aria-label="Next image"
              >
                &gt;
              </button>
            </>
          )}
        </div>

        <div className="h-24 shrink-0 border-t border-white/10 px-6 py-3">
          {imageCount > 1 ? (
            <div className="flex h-full items-center gap-3 overflow-x-auto">
              {images.map((url, index) => (
                <button
                  key={`${url}-${index}`}
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelectIndex(index);
                  }}
                  className={`h-14 w-20 shrink-0 overflow-hidden rounded-[12px] border bg-black/30 transition-all ${
                    index === selectedIndex
                      ? 'border-white/80 opacity-100'
                      : 'border-white/10 opacity-60 hover:border-white/30 hover:opacity-100'
                  }`}
                >
                  <img
                    src={resolveImageUrl(url)}
                    alt={`Output thumbnail ${index + 1}`}
                    draggable={false}
                    className="h-full w-full object-cover pointer-events-none select-none"
                  />
                </button>
              ))}
            </div>
          ) : (
            <div className="flex h-full items-center text-xs font-light text-white/25">
              {selectedUrl ? 'Single image' : 'No thumbnails'}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
