const DEFAULT_PEAK_COUNT = 1024;
const MAX_WAVEFORM_BYTES = 40 * 1024 * 1024;

export const formatAudioTime = (seconds) => {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) return '0:00';

  const totalSeconds = Math.floor(value);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
};

export const normalizePeaks = (peaks = []) => {
  if (!Array.isArray(peaks) && !(peaks instanceof Float32Array)) return [];
  const values = Array.from(peaks, (peak) => Math.abs(Number(peak) || 0));
  const max = Math.max(...values, 0);
  if (!max) return values.map(() => 0);
  return values.map((peak) => Math.min(1, peak / max));
};

export const resamplePeaksForWidth = (peaks = [], width = 0, options = {}) => {
  const safePeaks = normalizePeaks(peaks);
  const pixelRatio = Number.isFinite(options.pixelRatio) ? options.pixelRatio : 1;
  const barWidth = Math.max(1, Number.isFinite(Number(options.barWidth)) ? Number(options.barWidth) : 2);
  const gap = Math.max(0, Number.isFinite(Number(options.gap)) ? Number(options.gap) : 1);
  const targetCount = Math.max(1, Math.floor((Number(width) || 0) * pixelRatio / (barWidth + gap)));

  if (!safePeaks.length) return [];
  if (targetCount >= safePeaks.length) return safePeaks;

  const bucketSize = safePeaks.length / targetCount;
  return Array.from({ length: targetCount }, (_, index) => {
    const start = Math.floor(index * bucketSize);
    const end = Math.max(start + 1, Math.ceil((index + 1) * bucketSize));
    let max = 0;
    for (let peakIndex = start; peakIndex < end && peakIndex < safePeaks.length; peakIndex += 1) {
      max = Math.max(max, safePeaks[peakIndex]);
    }
    return max;
  });
};

export const getAudioPeaks = async (arrayBuffer, options = {}) => {
  if (!arrayBuffer || arrayBuffer.byteLength > (options.maxBytes || MAX_WAVEFORM_BYTES)) {
    return [];
  }

  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) return [];

  const audioContext = new AudioContextCtor();
  try {
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
    const peakCount = Math.max(1, Number(options.peakCount) || DEFAULT_PEAK_COUNT);
    const channelCount = audioBuffer.numberOfChannels || 1;
    const sampleCount = audioBuffer.length || 0;
    const bucketSize = Math.max(1, Math.floor(sampleCount / peakCount));
    const peaks = [];

    for (let bucket = 0; bucket < peakCount; bucket += 1) {
      const start = bucket * bucketSize;
      const end = bucket === peakCount - 1 ? sampleCount : Math.min(sampleCount, start + bucketSize);
      let max = 0;

      for (let channel = 0; channel < channelCount; channel += 1) {
        const data = audioBuffer.getChannelData(channel);
        for (let index = start; index < end; index += 1) {
          max = Math.max(max, Math.abs(data[index] || 0));
        }
      }
      peaks.push(max);
    }

    return normalizePeaks(peaks);
  } finally {
    if (typeof audioContext.close === 'function') {
      audioContext.close().catch(() => {});
    }
  }
};
