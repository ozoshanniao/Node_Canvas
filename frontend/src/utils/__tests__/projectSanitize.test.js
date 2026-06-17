import assert from 'node:assert/strict';
import { sanitizeProjectForSave } from '../projectSanitize.js';

const project = {
  nodes: [
    {
      id: 'video-1',
      type: 'videoNode',
      position: { x: 1, y: 2 },
      data: {
        provider: 'google',
        model: 'veo-3.1-generate-001',
        videoMode: 'text-to-video',
        aspectRatio: '16:9',
        apiKey: 'secret',
        rawResponse: { value: true },
        params: {
          seed: 42,
          negativePrompt: 'clean',
          source: 'C:\\tmp\\secret.png',
        },
        outputs: {
          video: {
            path: 'generation/video.mp4',
            url: '/api/generation/video.mp4',
          },
        },
      },
    },
    {
      id: 'text-1',
      type: 'textNode',
      data: { text: 'hello' },
    },
  ],
  edges: [{ id: 'e1', source: 'text-1', target: 'video-1', data: { label: 'ok' } }],
  groups: { g1: { id: 'g1' } },
};

const sanitized = sanitizeProjectForSave(project);
const videoData = sanitized.nodes[0].data;
const serialized = JSON.stringify(sanitized);

assert.equal(videoData.provider, 'google');
assert.equal(videoData.taskType, 'text-to-video');
assert.equal(videoData.params.seed, 42);
assert.equal(videoData.params.negativePrompt, 'clean');
assert.equal(videoData.params.source, undefined);
assert.equal(videoData.outputs.video.path, 'generation/video.mp4');
assert.equal(videoData.outputs.video.url, '/api/generation/video.mp4');
assert.equal(videoData.rawResponse, undefined);
assert.deepEqual(sanitized.nodes[1].data, { text: 'hello' });
assert.equal(serialized.includes('apiKey'), false);
assert.equal(serialized.includes('Authorization'), false);
assert.equal(serialized.includes('Bearer'), false);
assert.equal(serialized.includes('base64'), false);
assert.equal(serialized.includes('raw schema'), false);
assert.equal(serialized.includes('C:\\tmp'), false);

console.log('projectSanitize tests passed');
