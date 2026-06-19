import { useEffect, useState } from 'react';
import CustomSelect from './CustomSelect';
import { coerceParameterValue, getParameterDefaultValue } from '../utils/videoParameterSchema';

const valueToInput = (value, parameter) => {
  if (value !== undefined && value !== null) {
    return parameter?.type === 'object' && typeof value === 'object'
      ? JSON.stringify(value, null, 2)
      : value;
  }
  const fallback = getParameterDefaultValue(parameter);
  return parameter?.type === 'object' ? JSON.stringify(fallback, null, 2) : fallback;
};

export function ParameterInput({ name, parameter, value, onChange }) {
  const [localValue, setLocalValue] = useState(valueToInput(value, parameter));
  const ui = parameter?.ui || parameter?.type;

  useEffect(() => {
    setLocalValue(valueToInput(value, parameter));
  }, [parameter, value]);

  const commit = () => {
    onChange?.(name, coerceParameterValue(parameter, localValue));
  };

  const reset = () => setLocalValue(valueToInput(value, parameter));

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && ui !== 'textarea' && parameter?.type !== 'object') {
      event.preventDefault();
      commit();
      event.currentTarget.blur?.();
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      reset();
      event.currentTarget.blur?.();
    }
  };

  if (ui === 'select' || parameter?.type === 'select') {
    return (
      <CustomSelect
        value={localValue}
        options={parameter.options || []}
        onChange={(nextValue) => {
          setLocalValue(nextValue);
          onChange?.(name, coerceParameterValue(parameter, nextValue));
        }}
      />
    );
  }

  if (parameter?.type === 'boolean' || ui === 'toggle' || ui === 'checkbox') {
    const currentValue = value !== undefined ? Boolean(value) : Boolean(getParameterDefaultValue(parameter));
    return (
      <button
        type="button"
        onClick={() => onChange?.(name, !currentValue)}
        className={`nodrag h-7 w-12 rounded-full border p-0.5 transition-colors ${
          currentValue ? 'border-white/50 bg-white/80' : 'border-white/10 bg-black/25'
        }`}
      >
        <span className={`block h-5 w-5 rounded-full transition-transform ${currentValue ? 'translate-x-5 bg-black' : 'translate-x-0 bg-white/35'}`} />
      </button>
    );
  }

  if (ui === 'slider') {
    const numberValue = Number(localValue);
    return (
      <div className="nodrag nowheel flex items-center gap-2">
        <input
          type="range"
          value={Number.isFinite(numberValue) ? numberValue : parameter.default}
          min={parameter.min}
          max={parameter.max}
          step={parameter.step || 0.05}
          onChange={(event) => setLocalValue(event.target.value)}
          onBlur={commit}
          onKeyDown={handleKeyDown}
          className="nodrag nowheel h-6 flex-1 accent-white"
        />
        <span className="w-9 text-right text-[11px] text-white/45">
          {(Number.isFinite(numberValue) ? numberValue : Number(parameter.default || 0)).toFixed(2)}
        </span>
      </div>
    );
  }

  if (parameter?.type === 'number' || parameter?.type === 'integer') {
    return (
      <input
        type="number"
        value={localValue ?? ''}
        min={parameter.min}
        max={parameter.max}
        step={parameter.type === 'integer' ? 1 : parameter.step || 1}
        onChange={(event) => setLocalValue(event.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        className="nodrag w-full rounded-lg border border-white/10 bg-black/25 px-2 py-1.5 text-xs text-white/80 outline-none transition-colors hover:border-white/20"
      />
    );
  }

  if (ui === 'textarea' || parameter?.type === 'object') {
    return (
      <textarea
        value={localValue ?? ''}
        onChange={(event) => setLocalValue(event.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
        className="nodrag nowheel block h-20 w-full resize-none rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-xs text-white/75 outline-none transition-colors hover:border-white/20"
      />
    );
  }

  return (
    <input
      type="text"
      value={localValue ?? ''}
      onChange={(event) => setLocalValue(event.target.value)}
      onBlur={commit}
      onKeyDown={handleKeyDown}
      className="nodrag w-full rounded-lg border border-white/10 bg-black/25 px-2 py-1.5 text-xs text-white/80 outline-none transition-colors hover:border-white/20"
    />
  );
}
