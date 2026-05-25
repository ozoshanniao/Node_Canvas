import { useEffect, useMemo, useRef, useState } from 'react';

const normalizeOption = (option) => {
  if (typeof option === 'string') return { value: option, label: option };
  if (!option || typeof option !== 'object') return { value: option, label: String(option ?? '') };
  const value = option.value ?? option.id;
  return {
    value,
    label: option.label ?? String(value ?? ''),
  };
};

export default function CustomSelect({
  value,
  onChange,
  options = [],
  disabled = false,
  className = 'relative w-full nodrag',
  buttonClassName = 'flex w-full items-center justify-between rounded-lg border border-white/10 bg-black/25 px-2 py-1.5 text-xs text-white/80 outline-none transition-colors hover:border-white/20 disabled:cursor-not-allowed disabled:opacity-45',
  menuClassName = 'nowheel nodrag animate-in fade-in zoom-in-95 absolute left-0 right-0 z-[70] mt-1.5 rounded-xl border border-white/10 bg-[#141414]/95 shadow-2xl backdrop-blur-xl duration-150 overflow-hidden',
  optionClassName = '',
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  const normalizedOptions = useMemo(() => options.map(normalizeOption), [options]);

  const handleSelect = (optionValue) => {
    onChange(optionValue);
    setIsOpen(false);
  };

  useEffect(() => {
    if (!isOpen) return undefined;

    const handleOutsideClick = (event) => {
      if (!containerRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    window.addEventListener('mousedown', handleOutsideClick);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleOutsideClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const currentLabel = useMemo(() => {
    const found = normalizedOptions.find((option) => option.value === value);
    return found?.label ?? String(value ?? '');
  }, [normalizedOptions, value]);

  return (
    <div
      ref={containerRef}
      className={className}
      onMouseDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((open) => !open)}
        className={buttonClassName}
      >
        <span className="truncate">{currentLabel}</span>
        <svg className="ml-1 h-3 w-3 shrink-0 opacity-45" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className={menuClassName}>
          <div className="max-h-[160px] overflow-y-auto py-1 pr-1">
            {normalizedOptions.map((option) => {
              const isSelected = option.value === value;
              return (
                <button
                  type="button"
                  key={String(option.value)}
                  onClick={() => handleSelect(option.value)}
                  className={`block w-full px-3 py-1.5 text-left text-xs transition-colors ${
                    isSelected
                      ? 'bg-white/12 font-medium text-white'
                      : 'text-white/60 hover:bg-white/10 hover:text-white'
                  } ${optionClassName}`}
                >
                  <span className="block truncate">{option.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
