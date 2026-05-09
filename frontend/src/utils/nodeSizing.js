export const parseAspectRatio = (ratio = '1:1') => {
  const [rawWidth, rawHeight] = String(ratio || '1:1').split(':').map(Number);
  const widthRatio = Number.isFinite(rawWidth) && rawWidth > 0 ? rawWidth : 1;
  const heightRatio = Number.isFinite(rawHeight) && rawHeight > 0 ? rawHeight : 1;
  return { widthRatio, heightRatio };
};

export const getImageNodeAspectRatio = (data = {}) => data.aspectRatio || data.ratio || '1:1';

export const getImageNodeSizeByAspectRatio = (
  ratio,
  { maxSide = 520, minSide = 280, squareSide = 420 } = {}
) => {
  const { widthRatio, heightRatio } = parseAspectRatio(ratio);

  if (widthRatio === heightRatio) {
    return { width: squareSide, height: squareSide };
  }

  if (widthRatio > heightRatio) {
    return {
      width: maxSide,
      height: Math.max(minSide, Math.round((maxSide * heightRatio) / widthRatio)),
    };
  }

  return {
    width: Math.max(minSide, Math.round((maxSide * widthRatio) / heightRatio)),
    height: maxSide,
  };
};

export const hasValidNodeSize = (node = {}) =>
  Number.isFinite(node.width) && node.width > 0 && Number.isFinite(node.height) && node.height > 0;
