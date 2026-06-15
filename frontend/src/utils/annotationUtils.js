export const ANNOTATION_HISTORY_LIMIT = 20;
export const ANNOTATION_MAX_EXPORT_EDGE = 4096;
export const ANNOTATION_MAX_EXPORT_AREA = 4096 * 4096;

export const createAnnotationSourceKey = (url, width = 0, height = 0) =>
  url ? `${url}|${Math.round(width) || 0}x${Math.round(height) || 0}` : '';

export const isAnnotationSourceCurrent = (sourceImageKey, url) =>
  Boolean(sourceImageKey && url && sourceImageKey.startsWith(`${url}|`));

export const createAnnotationId = () =>
  `annotation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const createLocalEraserShape = (points = [], strokeWidth = 24) => ({
  id: createAnnotationId(),
  type: 'eraser',
  points: [...points],
  strokeWidth: Math.max(1, Number(strokeWidth) || 1),
});

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

const distanceToSegment = (point, start, end) => {
  const segmentX = end.x - start.x;
  const segmentY = end.y - start.y;
  const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;
  if (!segmentLengthSquared) return distance(point, start);

  const projection = Math.max(0, Math.min(1, (
    (point.x - start.x) * segmentX + (point.y - start.y) * segmentY
  ) / segmentLengthSquared));
  return distance(point, {
    x: start.x + projection * segmentX,
    y: start.y + projection * segmentY,
  });
};

export const isAnnotationShapeHit = (shape, point, eraserSize = 12) => {
  if (!shape || !point) return false;
  const tolerance = Math.max(1, Number(eraserSize) || 1) + Math.max(0, Number(shape.strokeWidth) || 0) / 2;

  if (shape.type === 'brush' || shape.type === 'eraser') {
    const points = Array.isArray(shape.points) ? shape.points : [];
    for (let index = 0; index < points.length; index += 2) {
      const start = { x: points[index], y: points[index + 1] };
      const end = index + 3 < points.length
        ? { x: points[index + 2], y: points[index + 3] }
        : start;
      if (distanceToSegment(point, start, end) <= tolerance) return true;
    }
    return false;
  }

  if (shape.type === 'rect' || shape.type === 'ellipse') {
    const left = Math.min(shape.x, shape.x + shape.width) - tolerance;
    const right = Math.max(shape.x, shape.x + shape.width) + tolerance;
    const top = Math.min(shape.y, shape.y + shape.height) - tolerance;
    const bottom = Math.max(shape.y, shape.y + shape.height) + tolerance;
    return point.x >= left && point.x <= right && point.y >= top && point.y <= bottom;
  }

  return false;
};

export const eraseAnnotationObjectsAtPoint = (annotations = [], point, eraserSize = 12) =>
  annotations.filter((shape) => !isAnnotationShapeHit(shape, point, eraserSize));

export const pushAnnotationHistory = (
  history = [],
  historyIndex = 0,
  annotations = [],
  limit = ANNOTATION_HISTORY_LIMIT
) => {
  const next = [...history.slice(0, historyIndex + 1), annotations].slice(-limit);
  return {
    history: next,
    historyIndex: next.length - 1,
  };
};

export const getAnnotationExportSize = (width, height) => {
  const safeWidth = Math.max(1, Math.round(width) || 1);
  const safeHeight = Math.max(1, Math.round(height) || 1);
  const edgeScale = Math.min(1, ANNOTATION_MAX_EXPORT_EDGE / Math.max(safeWidth, safeHeight));
  const areaScale = Math.min(1, Math.sqrt(ANNOTATION_MAX_EXPORT_AREA / (safeWidth * safeHeight)));
  const scale = Math.min(edgeScale, areaScale);

  return {
    width: Math.max(1, Math.round(safeWidth * scale)),
    height: Math.max(1, Math.round(safeHeight * scale)),
    scale,
  };
};

export const drawAnnotationShape = (ctx, shape) => {
  if (!ctx || !shape) return;

  ctx.save();
  ctx.globalCompositeOperation = shape.type === 'eraser' ? 'destination-out' : 'source-over';
  ctx.strokeStyle = shape.color || '#ff3b30';
  ctx.lineWidth = Math.max(1, Number(shape.strokeWidth) || 1);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (shape.type === 'brush' || shape.type === 'eraser') {
    const points = Array.isArray(shape.points) ? shape.points : [];
    if (points.length >= 2) {
      ctx.beginPath();
      ctx.moveTo(points[0], points[1]);
      for (let index = 2; index < points.length; index += 2) {
        ctx.lineTo(points[index], points[index + 1]);
      }
      if (points.length === 2) {
        ctx.lineTo(points[0] + 0.01, points[1] + 0.01);
      }
      ctx.stroke();
    }
  }

  if (shape.type === 'rect') {
    ctx.strokeRect(shape.x, shape.y, shape.width, shape.height);
  }

  if (shape.type === 'ellipse') {
    const centerX = shape.x + shape.width / 2;
    const centerY = shape.y + shape.height / 2;
    ctx.beginPath();
    ctx.ellipse(
      centerX,
      centerY,
      Math.abs(shape.width / 2),
      Math.abs(shape.height / 2),
      0,
      0,
      Math.PI * 2
    );
    ctx.stroke();
  }

  ctx.restore();
};

export const drawAnnotations = (ctx, annotations = []) => {
  annotations.forEach((shape) => drawAnnotationShape(ctx, shape));
};

export const renderAnnotationLayer = (ctx, annotations = [], draftShape = null) => {
  if (!ctx) return;
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  drawAnnotations(ctx, annotations);
  if (draftShape) drawAnnotationShape(ctx, draftShape);
};

export const exportAnnotatedImage = (image, annotations = []) => {
  const naturalWidth = image?.naturalWidth || image?.width || 0;
  const naturalHeight = image?.naturalHeight || image?.height || 0;
  if (!naturalWidth || !naturalHeight) {
    throw new Error('Source image is not loaded');
  }

  const exportSize = getAnnotationExportSize(naturalWidth, naturalHeight);
  const canvas = document.createElement('canvas');
  canvas.width = exportSize.width;
  canvas.height = exportSize.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available');

  ctx.drawImage(image, 0, 0, exportSize.width, exportSize.height);

  const annotationCanvas = document.createElement('canvas');
  annotationCanvas.width = exportSize.width;
  annotationCanvas.height = exportSize.height;
  const annotationCtx = annotationCanvas.getContext('2d');
  if (!annotationCtx) throw new Error('Canvas is not available');
  annotationCtx.scale(exportSize.scale, exportSize.scale);
  drawAnnotations(annotationCtx, annotations);
  ctx.drawImage(annotationCanvas, 0, 0);
  return canvas.toDataURL('image/png');
};
