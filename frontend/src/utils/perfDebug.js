export const isPerfFlagEnabled = (key) => {
  if (!import.meta.env.DEV || typeof window === 'undefined') return false;

  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
};

export const PERF_DEBUG = isPerfFlagEnabled('node-ai-canvas:perf-debug');
export const DISABLE_EDGE_ANIMATION = isPerfFlagEnabled('node-ai-canvas:disable-edge-animation');
export const DISABLE_MINIMAP = isPerfFlagEnabled('node-ai-canvas:disable-minimap');

const counters = new Map();
let timer = null;

export function countRender(name) {
  if (!PERF_DEBUG || typeof window === 'undefined') return;

  counters.set(name, (counters.get(name) || 0) + 1);

  if (!timer) {
    timer = window.setTimeout(() => {
      console.table(
        Array.from(counters.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([component, count]) => ({ component, count }))
      );
      counters.clear();
      timer = null;
    }, 1000);
  }
}

export function warnPerf(message, payload) {
  if (!PERF_DEBUG) return;
  console.warn(message, payload);
}
