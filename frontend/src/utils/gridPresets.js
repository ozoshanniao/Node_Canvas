export const SPLIT_GRID_PRESETS = [
  { key: '2x2', rows: 2, cols: 2, label: '2 x 2', count: 4 },
  { key: '1x5', rows: 1, cols: 5, label: '1 x 5', count: 5 },
  { key: '2x3', rows: 2, cols: 3, label: '2 x 3', count: 6 },
  { key: '3x2', rows: 3, cols: 2, label: '3 x 2', count: 6 },
  { key: '2x4', rows: 2, cols: 4, label: '2 x 4', count: 8 },
  { key: '3x3', rows: 3, cols: 3, label: '3 x 3', count: 9 },
  { key: '2x5', rows: 2, cols: 5, label: '2 x 5', count: 10 },
];

export const getSplitGridPreset = (key) =>
  SPLIT_GRID_PRESETS.find((preset) => preset.key === key) || null;

export const getSplitGridLabel = (rows, cols) => `${rows || 0} x ${cols || 0}`;

export const getSplitGridCount = (rows, cols) => {
  const safeRows = Number(rows) || 0;
  const safeCols = Number(cols) || 0;
  return safeRows * safeCols;
};
