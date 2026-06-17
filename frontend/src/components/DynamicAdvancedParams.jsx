import { ParameterInput } from './ParameterInput';
import { getAdvancedParameters } from '../utils/videoParameterSchema';

const PARAMETER_UI_EXCLUDE = new Set(['cameraControl']);

export function DynamicAdvancedParams({ capability, params = {}, onParamChange }) {
  const parameters = getAdvancedParameters(capability, params)
    .filter((parameter) => parameter.ui !== 'provider-specific')
    .filter((parameter) => !PARAMETER_UI_EXCLUDE.has(parameter.name));

  if (!parameters.length) {
    return (
      <div className="rounded-xl border border-white/5 bg-black/10 px-3 py-2 text-[11px] text-white/30">
        No advanced parameters for this model.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2.5">
      {parameters.map((parameter) => (
        <label key={parameter.name} className="nodrag nowheel grid gap-1.5">
          <span className="flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] text-white/30">
            {parameter.label || parameter.name}
            {parameter.experimental && <span className="text-[9px] text-amber-200/60">Experimental</span>}
            {parameter.deprecated && <span className="text-[9px] text-red-200/60">Deprecated</span>}
            {parameter.supported === false && <span className="text-[9px] text-white/20">Unsupported</span>}
          </span>
          <ParameterInput
            name={parameter.name}
            parameter={parameter}
            value={params[parameter.name]}
            onChange={onParamChange}
          />
          {parameter.description && <span className="text-[10px] text-white/25">{parameter.description}</span>}
        </label>
      ))}
    </div>
  );
}
