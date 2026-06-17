const CORE_PARAM_KEYS = new Set([
  'provider',
  'model',
  'taskType',
  'videoMode',
  'aspectRatio',
  'duration',
  'durationSeconds',
  'resolution',
  'generateAudio',
  'seed',
]);

export const getParameterSchema = (capability, paramName) =>
  capability?.parameters?.[paramName] || null;

export const getParametersByGroup = (capability, group) => {
  const parameters = capability?.parameters || {};
  return Object.entries(parameters)
    .filter(([, parameter]) => parameter?.group === group)
    .map(([name, parameter]) => ({ name, ...parameter }));
};

export const isParameterHidden = (capability, paramName) => {
  const parameter = getParameterSchema(capability, paramName);
  return !parameter || parameter.group === 'hidden' || parameter.ui === 'hidden';
};

export const isParameterVisible = (capability, paramName, params = {}) => {
  const parameter = getParameterSchema(capability, paramName);
  if (!parameter || isParameterHidden(capability, paramName)) return false;
  if (parameter.deprecated && params[paramName] === undefined) return false;
  return true;
};

const orderedParameters = (capability, group, order = [], params = {}) => {
  const parameters = capability?.parameters || {};
  if (!parameters || Object.keys(parameters).length === 0) return [];
  const orderedNames = [
    ...order.filter((name) => parameters[name]),
    ...Object.keys(parameters).filter((name) => !order.includes(name)),
  ];
  return orderedNames
    .filter((name) => parameters[name]?.group === group)
    .filter((name) => isParameterVisible(capability, name, params))
    .map((name) => ({ name, ...parameters[name] }));
};

export const getAdvancedParameters = (capability, params = {}) =>
  orderedParameters(capability, 'advanced', capability?.advancedParams || [], params)
    .filter((parameter) => !CORE_PARAM_KEYS.has(parameter.name));

export const getBasicParameters = (capability, params = {}) =>
  orderedParameters(capability, 'basic', capability?.quickParams || [], params);

export const getParameterDefaultValue = (parameter = {}) => {
  if (parameter.default !== undefined) return parameter.default;
  if (parameter.type === 'boolean' || parameter.ui === 'toggle' || parameter.ui === 'checkbox') return false;
  if (Array.isArray(parameter.options) && parameter.options.length > 0) return parameter.options[0];
  if (parameter.type === 'integer' || parameter.type === 'number') return null;
  if (parameter.type === 'object') return {};
  return '';
};

export const coerceParameterValue = (parameter = {}, value) => {
  const ui = parameter.ui || parameter.type;
  if (parameter.type === 'boolean' || ui === 'toggle' || ui === 'checkbox') {
    if (typeof value === 'boolean') return value;
    return ['true', '1', 'yes', 'on'].includes(String(value).toLowerCase());
  }
  if (parameter.type === 'integer') {
    const number = Number.parseInt(value, 10);
    return Number.isFinite(number) ? number : getParameterDefaultValue(parameter);
  }
  if (parameter.type === 'number' || ui === 'slider') {
    const number = Number(value);
    return Number.isFinite(number) ? number : getParameterDefaultValue(parameter);
  }
  if (parameter.type === 'object') {
    if (typeof value === 'object' && value !== null) return value;
    try {
      return JSON.parse(value || '{}');
    } catch {
      return getParameterDefaultValue(parameter);
    }
  }
  return value == null ? '' : String(value);
};
