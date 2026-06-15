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

await saveProjectCore(baseProject);

assert.equal(
  Object.prototype.hasOwnProperty.call(requests[2].body, 'viewport'),
  false,
  'saveProjectCore should remain compatible when viewport is omitted'
);
assert.deepEqual(
  requests[2].body.groups,
  baseProject.groups,
  'saving without viewport should preserve existing groups payload'
);

if (originalFetch === undefined) {
  delete globalThis.fetch;
} else {
  globalThis.fetch = originalFetch;
}

console.log('projectSave tests passed');
