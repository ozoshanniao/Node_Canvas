export const isPerfFlagEnabled = (key) => {
  if (typeof window === 'undefined') return false;

  try {
    return window.localStorage.getItem(key) === 'true' || window.localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
};

export const PERF_DEBUG = isPerfFlagEnabled('node-ai-canvas:perf-debug');
export const DISABLE_EDGE_ANIMATION = isPerfFlagEnabled('node-ai-canvas:disable-edge-animation');
export const DISABLE_MINIMAP = isPerfFlagEnabled('node-ai-canvas:disable-minimap');

/**
 * A/B 开关：启用 React Flow onlyRenderVisibleElements
 *
 * 开启方式（浏览器控制台）：
 *   localStorage.setItem('nac:perf:only-render-visible', 'true')
 *   然后刷新页面
 *
 * 关闭方式：
 *   localStorage.removeItem('nac:perf:only-render-visible')
 *   然后刷新页面
 *
 * 开启后需测试：
 *   - fitView 是否覆盖全部节点
 *   - MiniMap 离屏节点矩形是否显示
 *   - 快速平移时节点是否有"闪入"感
 *   - 离屏节点恢复显示时连接线端点是否正确
 *   - 节点较少时是否有额外收益（节点少时意义不大）
 */
export const ONLY_RENDER_VISIBLE_ELEMENTS = isPerfFlagEnabled('nac:perf:only-render-visible');

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
