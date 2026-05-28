import assert from 'node:assert/strict';
import { formatAudioTime, normalizePeaks, resamplePeaksForWidth } from '../audioWaveform.js';
import { isSupportedAudioFile, naturalCompareAudioFiles } from '../audioFiles.js';

assert.equal(formatAudioTime(0), '0:00');
assert.equal(formatAudioTime(65.9), '1:05');
assert.equal(formatAudioTime(3661), '1:01:01');
assert.equal(formatAudioTime(Number.NaN), '0:00');

assert.deepEqual(normalizePeaks([0, 2, -4]), [0, 0.5, 1]);
assert.deepEqual(normalizePeaks([0, 0]), [0, 0]);

assert.deepEqual(resamplePeaksForWidth([0, 0.5, 1, 0.25], 4, { barWidth: 2, gap: 0 }), [0.5, 1]);
assert.deepEqual(resamplePeaksForWidth([], 100), []);

assert.equal(isSupportedAudioFile('track.mp3'), true);
assert.equal(isSupportedAudioFile('track.OPUS'), true);
assert.equal(isSupportedAudioFile('image.png'), false);

const sorted = [{ name: 'track10.mp3' }, { name: 'track2.mp3' }, { name: 'track1.mp3' }]
  .sort(naturalCompareAudioFiles)
  .map((item) => item.name);
assert.deepEqual(sorted, ['track1.mp3', 'track2.mp3', 'track10.mp3']);

console.log('audioWaveform tests passed');

