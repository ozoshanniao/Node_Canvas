import assert from 'node:assert/strict';
import { saveProjectCore } from '../projectSave.js';

const originalFetch = globalThis.fetch;
const requests = [];

globalThis.fetch = async (url, options = {}) => {
  requests.push({
    url,
    options,
    body: JSON.parse(options.body),
  });
  return {
    ok: true,
    status: 200,
    text: async () => '',
  };
};

const baseProject = {
  projectPath: 'Z:/tmp/node-canvas-project',
  projectFilePath: 'Z:/tmp/node-canvas-project/project.json',
  projectName: 'Viewport Test',
  appSettings: {
    language: 'en-US',
    showRawCustomParams: true,
    publicAssetStorage: 'r2',
    canvasBackgroundColor: '#123456',
    canvasGridColor: '#abcdef',
  },
  nodes: [
    {
      id: 'node-1',
      type: 'textNode',
      position: { x: 12, y: 34 },
      selected: true,
      data: { text: 'hello', flowing: true },
    },
  ],
  edges: [
    {
      id: 'edge-1',
      source: 'node-1',
      target: 'node-2',
      sourceHandle: 'text:out',
      targetHandle: 'text:in',
      selected: true,
      data: { flowing: true },
    },
  ],
  groups: { groupA: { id: 'groupA' } },
};

await saveProjectCore({
  ...baseProject,
  viewport: { x: -120.5, y: 42, zoom: 0.75 },
});

assert.equal(requests[0].url, 'http://127.0.0.1:8000/api/project/save');
assert.deepEqual(
  requests[0].body.viewport,
  { x: -120.5, y: 42, zoom: 0.75 },
  'saveProjectCore payload should include the current React Flow viewport'
);
assert.deepEqual(
  requests[0].body.nodes[0].position,
  baseProject.nodes[0].position,
  'saving viewport should not alter node positions'
);
assert.equal(
  requests[0].body.nodes[0].data.flowing,
  undefined,
  'existing node sanitization should still run'
);
assert.equal(
  Object.prototype.hasOwnProperty.call(requests[0].body, 'appSettings'),
  false,
  'app settings must never be included in the project save payload'
);

await saveProjectCore({
  ...baseProject,
  nodes: [
    {
      id: 'curve-1',
      type: 'easeCurveNode',
      position: { x: 0, y: 0 },
      data: {
        outputVideo: 'data:video/webm;base64,' + 'a'.repeat(200),
        outputVideoPath: 'generation/ease_curve/ease_curve_curve-1_run-1.mp4',
        status: 'done',
      },
    },
  ],
});

assert.equal(
  requests[1].body.nodes[0].data.outputVideo,
  undefined,
  'inline Easy Curve video data should not be saved into project JSON'
);
assert.equal(
  requests[1].body.nodes[0].data.outputVideoPath,
  'generation/ease_curve/ease_curve_curve-1_run-1.mp4',
  'Easy Curve project file path should be saved'
);

await saveProjectCore({
  ...baseProject,
  nodes: [
    {
      id: 'llm-1',
      type: 'llmProcessor',
      position: { x: 0, y: 0 },
      data: {
        provider: 'openai',
        model: 'gpt-5.5',
        apiKey: 'secret',
        baseUrl: 'https://api.openai.com/v1',
        outputText: 'hello',
      },
    },
  ],
});
assert.equal(requests[2].body.nodes[0].data.apiKey, undefined);
assert.equal(requests[2].body.nodes[0].data.baseUrl, undefined);
assert.equal(requests[2].body.nodes[0].data.provider, 'openai');
assert.equal(requests[2].body.nodes[0].data.model, 'gpt-5.5');

await saveProjectCore(baseProject);

assert.equal(
  Object.prototype.hasOwnProperty.call(requests[3].body, 'viewport'),
  false,
  'saveProjectCore should remain compatible when viewport is omitted'
);
assert.deepEqual(
  requests[3].body.groups,
  baseProject.groups,
  'saving without viewport should preserve existing groups payload'
);

await saveProjectCore({
  ...baseProject,
  nodes: [
    {
      id: 'video-1',
      type: 'videoNode',
      data: {
        provider: 'google',
        model: 'veo-3.1-generate-001',
        videoMode: 'text-to-video',
        aspectRatio: '9:16',
        apiKey: 'secret',
        rawResponse: { ok: true },
        params: {
          seed: 99,
          localFile: '/Users/me/private.png',
        },
        outputs: {
          video: {
            path: 'generation/video.mp4',
            url: '/api/generation/video.mp4',
          },
        },
      },
    },
  ],
});

assert.deepEqual(
  Object.keys(requests[4].body.nodes[0].data).sort(),
  ['model', 'outputs', 'params', 'provider', 'schemaSnapshot', 'taskType'],
  'video nodes should be saved with the clean Phase 3 data contract'
);
assert.equal(requests[4].body.nodes[0].data.params.aspectRatio, '9:16');
assert.equal(requests[4].body.nodes[0].data.params.localFile, undefined);
assert.equal(requests[4].body.nodes[0].data.apiKey, undefined);
assert.equal(requests[4].body.nodes[0].data.rawResponse, undefined);
assert.equal(requests[4].body.nodes[0].data.outputs.video.path, 'generation/video.mp4');
assert.equal(requests[4].body.nodes[0].data.outputs.video.url, '/api/generation/video.mp4');

if (originalFetch === undefined) {
  delete globalThis.fetch;
} else {
  globalThis.fetch = originalFetch;
}

console.log('projectSave tests passed');
