export const EASE_CURVE_PRESET_IMAGE_DIR = '/presets/ease-curve';

export const EASING_PRESET_OPTIONS = [
  { id: 'linear', label: 'Linear', handles: [0, 0, 1, 1] },
  { id: 'ease', label: 'Ease', handles: [0.25, 0.1, 0.25, 1] },
  { id: 'ease-in', label: 'Ease In', handles: [0.42, 0, 1, 1] },
  { id: 'ease-out', label: 'Ease Out', handles: [0, 0, 0.58, 1] },
  { id: 'ease-in-out', label: 'Ease In Out', handles: [0.42, 0, 0.58, 1] },
  { id: 'ease-in-sine', label: 'Ease In Sine', handles: [0.47, 0, 0.745, 0.715] },
  { id: 'ease-out-sine', label: 'Ease Out Sine', handles: [0.39, 0.575, 0.565, 1] },
  { id: 'ease-in-out-sine', label: 'Ease In Out Sine', handles: [0.445, 0.05, 0.55, 0.95] },
  { id: 'ease-in-quad', label: 'Ease In Quad', handles: [0.55, 0.085, 0.68, 0.53] },
  { id: 'ease-out-quad', label: 'Ease Out Quad', handles: [0.25, 0.46, 0.45, 0.94] },
  { id: 'ease-in-out-quad', label: 'Ease In Out Quad', handles: [0.455, 0.03, 0.515, 0.955] },
  { id: 'ease-in-cubic', label: 'Ease In Cubic', handles: [0.55, 0.055, 0.675, 0.19] },
  { id: 'ease-out-cubic', label: 'Ease Out Cubic', handles: [0.215, 0.61, 0.355, 1] },
  { id: 'ease-in-out-cubic', label: 'Ease In Out Cubic', handles: [0.645, 0.045, 0.355, 1] },
].map((preset) => ({
  ...preset,
  image: `${EASE_CURVE_PRESET_IMAGE_DIR}/${preset.id}.png`,
}));

const LEGACY_PRESET_IDS = {
  easeIn: 'ease-in',
  easeOut: 'ease-out',
  easeInOut: 'ease-in-out',
};

const handlesArrayToObject = (handles = [0.42, 0, 0.58, 1]) => ({
  x1: handles[0],
  y1: handles[1],
  x2: handles[2],
  y2: handles[3],
});

export const EASING_PRESET_BY_ID = Object.fromEntries(EASING_PRESET_OPTIONS.map((preset) => [preset.id, preset]));

export const EASING_PRESETS = Object.fromEntries(
  EASING_PRESET_OPTIONS.map((preset) => [preset.id, handlesArrayToObject(preset.handles)])
);

export const normalizeEasingPresetId = (presetId) => {
  const normalized = LEGACY_PRESET_IDS[presetId] || presetId;
  return EASING_PRESET_BY_ID[normalized] ? normalized : null;
};

export const getEasingPresetHandles = (presetId) => {
  const normalized = normalizeEasingPresetId(presetId);
  return normalized ? { ...EASING_PRESETS[normalized] } : null;
};

export const getEasingPresetImagePath = (presetId) => `${EASE_CURVE_PRESET_IMAGE_DIR}/${presetId}.png`;

export const DEFAULT_EASE_CURVE_DATA = {
  label: 'Easy Curve',
  bezierHandles: EASING_PRESETS['ease-in-out'],
  easingPreset: 'ease-in-out',
  inheritedFrom: null,
  outputDuration: 1.5,
  outputVideo: null,
  outputVideoWarning: null,
  status: 'idle',
  error: null,
  progress: 0,
  encoderSupported: null,
};
