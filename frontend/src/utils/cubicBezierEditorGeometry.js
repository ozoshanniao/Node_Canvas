export const isFiniteRectSize = (size = {}) =>
  Number.isFinite(size.width) && Number.isFinite(size.height) && size.width > 0 && size.height > 0;

export const getBezierPointPixelPosition = ({ x = 0, y = 0 }, size = {}) => {
  if (!isFiniteRectSize(size)) return null;
  const pointX = Number(x);
  const pointY = Number(y);
  if (!Number.isFinite(pointX) || !Number.isFinite(pointY)) return null;

  return {
    left: pointX * size.width,
    top: (1 - pointY) * size.height,
  };
};

export const toPlotPoint = (point, size) => getBezierPointPixelPosition(point, size);

export const toSvgPoint = ({ x = 0, y = 0 }) => {
  const pointX = Number(x);
  const pointY = Number(y);
  if (!Number.isFinite(pointX) || !Number.isFinite(pointY)) return { x: 0, y: 100 };

  return {
    x: pointX * 100,
    y: (1 - pointY) * 100,
  };
};

export const getBezierPointFromClientRect = (event, rect) => {
  if (!event || !isFiniteRectSize(rect)) return null;

  const x = (event.clientX - rect.left) / rect.width;
  const y = 1 - (event.clientY - rect.top) / rect.height;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  return {
    x: Math.min(1, Math.max(0, x)),
    y: Math.min(1, Math.max(0, y)),
  };
};
