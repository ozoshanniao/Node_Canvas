const EPSILON = 1e-6;

export const clamp01 = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(1, Math.max(0, number));
};

export const normalizeBezierHandles = (handles = {}) => ({
  x1: clamp01(handles.x1 ?? 0.42),
  y1: clamp01(handles.y1 ?? 0),
  x2: clamp01(handles.x2 ?? 0.58),
  y2: clamp01(handles.y2 ?? 1),
});

const cubic = (t, a, b) => {
  const inv = 1 - t;
  return 3 * inv * inv * t * a + 3 * inv * t * t * b + t * t * t;
};

const cubicDerivative = (t, a, b) => {
  const inv = 1 - t;
  return 3 * inv * inv * a + 6 * inv * t * (b - a) + 3 * t * t * (1 - b);
};

export const sampleBezier = (handles = {}, t = 0) => {
  const safe = normalizeBezierHandles(handles);
  const x = clamp01(t);
  let estimate = x;

  for (let i = 0; i < 8; i += 1) {
    const sampledX = cubic(estimate, safe.x1, safe.x2) - x;
    const derivative = cubicDerivative(estimate, safe.x1, safe.x2);
    if (Math.abs(sampledX) < EPSILON) break;
    if (Math.abs(derivative) < EPSILON) break;
    estimate = clamp01(estimate - sampledX / derivative);
  }

  if (Math.abs(cubic(estimate, safe.x1, safe.x2) - x) > 0.001) {
    let low = 0;
    let high = 1;
    estimate = x;
    for (let i = 0; i < 24; i += 1) {
      const midpoint = (low + high) / 2;
      const midpointX = cubic(midpoint, safe.x1, safe.x2);
      if (Math.abs(midpointX - x) < EPSILON) {
        estimate = midpoint;
        break;
      }
      if (midpointX < x) low = midpoint;
      else high = midpoint;
      estimate = midpoint;
    }
  }

  return clamp01(cubic(estimate, safe.y1, safe.y2));
};

export const createBezierEasing = (handles = {}) => (time) => sampleBezier(handles, time);

export const generateEasingPolyline = (handles = {}, samples = 48) => {
  const count = Math.max(2, Math.floor(samples));
  return Array.from({ length: count }, (_, index) => {
    const t = index / (count - 1);
    return {
      x: t,
      y: sampleBezier(handles, t),
    };
  });
};
