import assert from 'node:assert/strict';
import { getNodeAudioOutput, getNodeImageOutput, getNodeOmniParamsOutput, getNodeVideoOutput } from '../nodeOutputs.js';
import { normalizeImageInputEdgeLabels } from '../edgeLabels.js';

const makeOmniNode = (data) => ({
  id: 'omni-1',
  type: 'omniComposerNode',
  data,
});

const imageNode = {
  id: 'image-1',
  type: 'imageNode',
  data: {
    url: 'input/ref.png',
  },
};

const imageEdge = {
  id: 'edge-image',
  source: 'image-1',
  target: 'omni-1',
  targetHandle: 'image:references',
};

{
  const edges = normalizeImageInputEdgeLabels([
    { id: 'v1', source: 'video-a', target: 'seedance', targetHandle: 'video:references', data: {} },
    { id: 'v2', source: 'video-b', target: 'seedance', targetHandle: 'video:references', data: {} },
    { id: 'a1', source: 'audio-a', target: 'seedance', targetHandle: 'audio:references', data: {} },
  ]);
  assert.equal(edges[0].data.kind, 'video');
  assert.equal(edges[0].data.videoIndex, 0);
  assert.equal(edges[0].data.inputLabel, 'video1');
  assert.equal(edges[1].data.videoIndex, 1);
  assert.equal(edges[1].data.inputLabel, 'video2');
  assert.equal(edges[2].data.kind, 'audio');
  assert.equal(edges[2].data.audioIndex, 0);
  assert.equal(edges[2].data.inputLabel, 'audio1');
}

{
  const videoOutput = getNodeVideoOutput({
    id: 'video-1',
    type: 'videoNode',
    data: { outputs: { videoUrl: '/api/video/generated.mp4' } },
  });
  assert.deepEqual(videoOutput, ['/api/video/generated.mp4']);
  assert.deepEqual(getNodeAudioOutput({ id: 'empty', type: 'imageNode', data: {} }), []);
  assert.deepEqual(getNodeAudioOutput({
    id: 'audio-1',
    type: 'audioInputNode',
    data: { url: 'input/ref.opus' },
  }), ['input/ref.opus']);
  assert.deepEqual(getNodeAudioOutput({
    id: 'audio-2',
    type: 'audioInputNode',
    data: {
      currentIndex: 1,
      audioFiles: [
        { url: 'input/ref1.mp3' },
        { url: 'input/ref2.flac' },
      ],
    },
  }), ['input/ref2.flac']);
}

{
  const lastFrame = {
    type: 'image',
    sourceType: 'generated',
    url: 'generation/seedance_task_last_frame.png',
    filePath: 'generation/seedance_task_last_frame.png',
    remoteUrl: 'https://seedance.test/last.png',
    filename: 'seedance_task_last_frame.png',
    mimeType: 'image/png',
  };
  assert.deepEqual(getNodeImageOutput({
    id: 'video-1',
    type: 'videoNode',
    data: { outputs: { lastFrame } },
  }, 'image:lastFrame'), [lastFrame]);
  assert.deepEqual(getNodeImageOutput({
    id: 'video-1',
    type: 'videoNode',
    data: { outputs: { lastFrame: null } },
  }, 'image:lastFrame'), []);
  assert.deepEqual(getNodeImageOutput({
    id: 'video-1',
    type: 'videoNode',
    data: { outputs: { lastFrame } },
  }, 'video:out'), []);
}

{
  const output = getNodeOmniParamsOutput(
    makeOmniNode({
      prompt: 'Use @image_1 with @element_1',
      elements: ['123456'],
    }),
    [imageEdge],
    [imageNode]
  );

  assert.equal(output.isValid, true);
  assert.equal(output.resolvedPrompt, 'Use <<<image_1>>> with <<<element_1>>>');
}

{
  const output = getNodeOmniParamsOutput(makeOmniNode({
    prompt: 'Use @element_1',
    elements: ['123456'],
  }));

  assert.equal(output.isValid, true);
  assert.equal(output.resolvedPrompt, 'Use <<<element_1>>>');
  assert.deepEqual(output.elements, [
    {
      alias: 'element_1',
      elementId: 123456,
    },
  ]);
}

{
  const output = getNodeOmniParamsOutput(makeOmniNode({
    prompt: 'Use @element_1',
    elements: ['abc'],
  }));

  assert.equal(output.isValid, false);
  assert.equal(output.errors.includes('Invalid Kling element ID.'), true);
  assert.equal(Number.isNaN(output.elements[0].elementId), true);
}

{
  const output = getNodeOmniParamsOutput(makeOmniNode({
    prompt: 'No element reference required',
    elements: ['', '789'],
  }));

  assert.equal(output.isValid, true);
  assert.deepEqual(output.elements, [
    {
      alias: 'element_1',
      elementId: 789,
    },
  ]);
}

{
  const output = getNodeOmniParamsOutput(makeOmniNode({
    prompt: 'Use <<<element_1>>>',
    elements: [''],
  }));

  assert.equal(output.isValid, false);
  assert.equal(output.errors.includes('Unknown Omni reference: <<<element_1>>>'), true);
}

{
  const output = getNodeOmniParamsOutput(makeOmniNode({
    prompt: 'Use <<<image_1>>>',
    elements: [],
  }), [imageEdge], [imageNode]);

  assert.equal(output.isValid, true);
  assert.equal(output.resolvedPrompt, 'Use <<<image_1>>>');
}

{
  const output = getNodeOmniParamsOutput(makeOmniNode({
    prompt: 'Use @element_2',
    elements: ['123456'],
  }));

  assert.equal(output.isValid, false);
  assert.equal(output.errors.includes('Unknown Omni reference: @element_2'), true);
}

// ==================== RouteNode Relay Tests ====================
import { getNodeTextOutput } from '../nodeOutputs.js';

// 1. RouteNode 透传 TextNode text
{
  const textNode = {
    id: 'text-1',
    type: 'textNode',
    data: { text: 'a cat walking' },
  };
  const routeNode = {
    id: 'route-1',
    type: 'routeNode',
    data: {},
  };
  const nodes = [textNode, routeNode];
  const edges = [
    {
      id: 'e-1',
      source: 'text-1',
      sourceHandle: 'text:out',
      target: 'route-1',
      targetHandle: 'text:in',
    },
  ];

  const output = getNodeTextOutput(routeNode, nodes, edges);
  assert.equal(output, 'a cat walking');
}

// 2. RouteNode 多级透传 TextNode text
{
  const textNode = {
    id: 'text-1',
    type: 'textNode',
    data: { text: 'a dog sleeping' },
  };
  const route1 = {
    id: 'route-1',
    type: 'routeNode',
    data: {},
  };
  const route2 = {
    id: 'route-2',
    type: 'routeNode',
    data: {},
  };
  const nodes = [textNode, route1, route2];
  const edges = [
    {
      id: 'e-1',
      source: 'text-1',
      sourceHandle: 'text:out',
      target: 'route-1',
      targetHandle: 'text:in',
    },
    {
      id: 'e-2',
      source: 'route-1',
      sourceHandle: 'text:out',
      target: 'route-2',
      targetHandle: 'text:in',
    },
  ];

  const output = getNodeTextOutput(route2, nodes, edges);
  assert.equal(output, 'a dog sleeping');
}

// 3. RouteNode 透传 ImageInputNode image (由于 ImageInputNode 在 getNodeImageOutput 中只提取 URL)
{
  const imageInputNode = {
    id: 'img-input-1',
    type: 'imageInputNode',
    data: {
      url: 'input/test.png',
      filePath: 'input/test.png',
      type: 'image',
    },
  };
  const routeNode = {
    id: 'route-1',
    type: 'routeNode',
    data: {},
  };
  const nodes = [imageInputNode, routeNode];
  const edges = [
    {
      id: 'e-1',
      source: 'img-input-1',
      sourceHandle: 'image:out',
      target: 'route-1',
      targetHandle: 'image:in',
    },
  ];

  const output = getNodeImageOutput(routeNode, 'image:out', null, nodes, edges);
  assert.deepEqual(output, ['input/test.png']);
}

// 4. RouteNode 多级透传 ImageInputNode image URL
{
  const imageInputNode = {
    id: 'img-input-1',
    type: 'imageInputNode',
    data: {
      url: 'input/test.png',
      filePath: 'input/test.png',
      type: 'image',
    },
  };
  const route1 = {
    id: 'route-1',
    type: 'routeNode',
    data: {},
  };
  const route2 = {
    id: 'route-2',
    type: 'routeNode',
    data: {},
  };
  const nodes = [imageInputNode, route1, route2];
  const edges = [
    {
      id: 'e-1',
      source: 'img-input-1',
      sourceHandle: 'image:out',
      target: 'route-1',
      targetHandle: 'image:in',
    },
    {
      id: 'e-2',
      source: 'route-1',
      sourceHandle: 'image:out',
      target: 'route-2',
      targetHandle: 'image:in',
    },
  ];

  const output = getNodeImageOutput(route2, 'image:out', null, nodes, edges);
  assert.deepEqual(output, ['input/test.png']);
}

// 5. RouteNode 透传 image 时不丢 filePath/url/mimeType/sourceType (以 VideoNode 最后一帧的完整对象为例)
{
  const lastFrameObj = {
    type: 'image',
    sourceType: 'generated',
    url: 'generation/seedance_task_last_frame.png',
    filePath: 'generation/seedance_task_last_frame.png',
    filename: 'seedance_task_last_frame.png',
    mimeType: 'image/png',
  };
  const videoNode = {
    id: 'video-1',
    type: 'videoNode',
    data: {
      outputs: {
        lastFrame: lastFrameObj,
      },
    },
  };
  const routeNode = {
    id: 'route-1',
    type: 'routeNode',
    data: {},
  };
  const nodes = [videoNode, routeNode];
  const edges = [
    {
      id: 'e-1',
      source: 'video-1',
      sourceHandle: 'image:lastFrame',
      target: 'route-1',
      targetHandle: 'image:in',
    },
  ];

  const output = getNodeImageOutput(routeNode, 'image:out', null, nodes, edges);
  assert.deepEqual(output, [lastFrameObj]);
  // 校验属性不丢失
  assert.equal(output[0].filePath, 'generation/seedance_task_last_frame.png');
  assert.equal(output[0].sourceType, 'generated');
  assert.equal(output[0].mimeType, 'image/png');
}

console.log('nodeOutputs tests passed');

