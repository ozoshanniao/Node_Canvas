import { useCallback } from 'react';
import { sampleBezier } from '../lib/easingFunctions.js';

const MAX_PERSISTENT_OUTPUT_BYTES = 20 * 1024 * 1024;
const DEFAULT_FPS = 24;

const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

const loadVideo = async (url) => {
  const video = document.createElement('video');
  video.crossOrigin = 'anonymous';
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = url;

  await new Promise((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener('loadedmetadata', resolve);
      video.removeEventListener('error', reject);
    };
    video.addEventListener('loadedmetadata', () => {
      cleanup();
      resolve();
    });
    video.addEventListener('error', () => {
      cleanup();
      reject(new Error('Unable to load input video metadata.'));
    });
  });

  return video;
};

const seekVideo = async (video, time) => {
  const target = Math.max(0, Math.min(video.duration || 0, time));
  if (Math.abs(video.currentTime - target) < 0.002) return;

  await new Promise((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener('seeked', handleSeeked);
      video.removeEventListener('error', handleError);
    };
    const handleSeeked = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error('Unable to seek input video.'));
    };
    video.addEventListener('seeked', handleSeeked);
    video.addEventListener('error', handleError);
    video.currentTime = target;
  });
};

const getSupportedMediaRecorderType = () => {
  const candidates = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];
  return candidates.find((type) => window.MediaRecorder?.isTypeSupported?.(type)) || '';
};

const encodeWithMediabunny = async ({ canvas, drawFrame, fps, height, onProgress, totalFrames, width }) => {
  const {
    BufferTarget,
    CanvasSource,
    Mp4OutputFormat,
    Output,
    QUALITY_HIGH,
    canEncodeVideo,
  } = await import('mediabunny');

  const canEncodeAvc = await canEncodeVideo('avc', {
    width,
    height,
    bitrate: QUALITY_HIGH,
  });
  if (!canEncodeAvc) {
    throw new Error('AVC WebCodecs encoder is not available.');
  }

  const output = new Output({
    format: new Mp4OutputFormat(),
    target: new BufferTarget(),
  });
  const videoSource = new CanvasSource(canvas, {
    codec: 'avc',
    bitrate: QUALITY_HIGH,
  });
  output.addVideoTrack(videoSource, { frameRate: fps });

  await output.start();
  for (let frame = 0; frame < totalFrames; frame += 1) {
    await drawFrame(frame);
    await videoSource.add(frame / fps, 1 / fps);
    onProgress?.(Math.round(((frame + 1) / totalFrames) * 100));
  }
  videoSource.close();
  await output.finalize();

  return new Blob([output.target.buffer], { type: 'video/mp4' });
};

const encodeWithMediaRecorder = async ({ canvas, drawFrame, fps, onProgress, totalFrames }) => {
  const stream = canvas.captureStream(fps);
  const mimeType = getSupportedMediaRecorderType();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks = [];

  recorder.ondataavailable = (event) => {
    if (event.data?.size) chunks.push(event.data);
  };

  const complete = new Promise((resolve, reject) => {
    recorder.onstop = resolve;
    recorder.onerror = () => reject(new Error('MediaRecorder failed while exporting Easy Curve output.'));
  });

  recorder.start(250);
  for (let frame = 0; frame < totalFrames; frame += 1) {
    await drawFrame(frame);
    onProgress?.(Math.round(((frame + 1) / totalFrames) * 100));
    await sleep(1000 / fps);
  }

  recorder.stop();
  await complete;
  stream.getTracks().forEach((track) => track.stop());
  return new Blob(chunks, { type: mimeType || 'video/webm' });
};

export const detectSpeedCurveEncoderSupport = async () => {
  const support = {
    webCodecs: Boolean(window.VideoEncoder && window.VideoFrame),
    mediaRecorder: Boolean(window.MediaRecorder),
    mediabunny: false,
  };

  try {
    const mediabunny = await import('mediabunny');
    support.mediabunny = Boolean(mediabunny?.Input && mediabunny?.Output);
  } catch {
    support.mediabunny = false;
  }

  return support;
};

export const applySpeedCurveAsync = async ({
  sourceVideo,
  bezierHandles,
  outputDuration,
  fps = DEFAULT_FPS,
  onProgress,
}) => {
  if (!sourceVideo) {
    throw new Error('Easy Curve requires a video input.');
  }
  const resolvedDuration = Math.max(0.25, Number(outputDuration) || 1.5);
  const sourceResponse = await fetch(sourceVideo);
  if (!sourceResponse.ok) {
    throw new Error(`Unable to read source video: HTTP ${sourceResponse.status} (${sourceVideo})`);
  }

  const sourceBlob = await sourceResponse.blob();
  const sourceUrl = URL.createObjectURL(sourceBlob);
  try {
    const video = await loadVideo(sourceUrl);
    const width = Math.max(2, Math.round(video.videoWidth || 1280));
    const height = Math.max(2, Math.round(video.videoHeight || 720));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    const totalFrames = Math.max(2, Math.ceil(resolvedDuration * fps));
    const drawFrame = async (frame) => {
      const outputTime = totalFrames <= 1 ? 0 : frame / (totalFrames - 1);
      const sourceTime = sampleBezier(bezierHandles, outputTime) * Math.max(0, video.duration || 0);
      await seekVideo(video, sourceTime);
      context.drawImage(video, 0, 0, width, height);
    };

    let outputBlob;
    try {
      outputBlob = await encodeWithMediabunny({
        canvas,
        drawFrame,
        fps,
        height,
        onProgress,
        totalFrames,
        width,
      });
    } catch (mediabunnyError) {
      if (!window.MediaRecorder) {
        throw mediabunnyError;
      }
      outputBlob = await encodeWithMediaRecorder({
        canvas,
        drawFrame,
        fps,
        onProgress,
        totalFrames,
      });
    }

    return {
      blob: outputBlob,
      metadata: {
        width,
        height,
        fps,
        sourceDuration: video.duration || 0,
        outputDuration: resolvedDuration,
        mimeType: outputBlob.type || 'video/mp4',
      },
    };
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
};

export const persistOutputVideo = async (blob) => {
  if (blob.size > MAX_PERSISTENT_OUTPUT_BYTES) {
    return {
      url: URL.createObjectURL(blob),
      warning: 'Large Easy Curve output is stored as a temporary browser blob URL. Re-run after reload if needed.',
    };
  }

  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Unable to persist Easy Curve output.'));
    reader.readAsDataURL(blob);
  });

  return { url: dataUrl, warning: null };
};

export const useApplySpeedCurve = () =>
  useCallback((options) => applySpeedCurveAsync(options), []);
