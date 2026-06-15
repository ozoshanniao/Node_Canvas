import assert from 'node:assert/strict';
import { getNodeAudioOutput, getNodeEaseCurveOutput, getNodeImageOutput, getNodeOmniParamsOutput, getNodeVideoInputOutput, getNodeVideoOutput } from '../nodeOutputs.js';
import {
  createLocalEraserShape,
  eraseAnnotationObjectsAtPoint,
  exportAnnotatedImage,
  isAnnotationShapeHit,
  pushAnnotationHistory,
  renderAnnotationLayer,
} from '../annotationUtils.js';
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
  const videoInputOutput = getNodeVideoInputOutput({
    id: 'video-input-1',
    type: 'videoInputNode',
    data: { videoUrl: 'input/ref.mp4' },
  });
  assert.equal(videoInputOutput, 'http://127.0.0.1:8000/api/input/ref.mp4');
  assert.deepEqual(getNodeVideoOutput({
    id: 'video-input-1',
    type: 'videoInputNode',
    data: { videoUrl: 'input/ref.mp4' },
  }), ['http://127.0.0.1:8000/api/input/ref.mp4']);

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
  const easeCurveNode = {
    id: 'curve-1',
    type: 'easeCurveNode',
    data: {
      outputVideoPath: 'generation/ease_curve/ease_curve_curve-1_run-1.mp4',
      outputVideo: 'data:video/webm;base64,abc',
      bezierHandles: { x1: 0.42, y1: 0, x2: 0.58, y2: 1 },
      easingPreset: 'easeInOut',
      outputDuration: 2,
    },
  };
  assert.deepEqual(getNodeVideoOutput(easeCurveNode), ['generation/ease_curve/ease_curve_curve-1_run-1.mp4']);
  assert.deepEqual(getNodeEaseCurveOutput(easeCurveNode), {
    type: 'easeCurve',
    bezierHandles: { x1: 0.42, y1: 0, x2: 0.58, y2: 1 },
    easingPreset: 'ease-in-out',
    outputDuration: 2,
    sourceNodeId: 'curve-1',
  });
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

{
  const rawText = '<var="shot1">A shot description</var>\nPlain text';
  const textNode = {
    id: 'text-inline',
    type: 'textNode',
    data: { text: rawText },
  };

  assert.equal(getNodeTextOutput(textNode), rawText);
}

{
  const textNode = {
    id: 'text-media-token',
    type: 'textNode',
    data: {
      text: '@image_1 prompt',
      textTokens: [{ id: 'media-1', type: 'media', value: 'image_1', start: 0, end: 8 }],
    },
  };

  assert.equal(getNodeTextOutput(textNode), '@image_1 prompt');
}

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

// AnnotateNode outputs its saved composite only while the upstream source key is current.
{
  const imageInputNode = {
    id: 'image-input',
    type: 'imageInputNode',
    data: { url: 'input/source.png' },
  };
  const annotateNode = {
    id: 'annotate',
    type: 'annotateNode',
    data: {
      annotatedImagePath: 'input/annotated.png',
      sourceImageKey: 'input/source.png|1024x768',
      currentSourceImageKey: 'input/source.png|1024x768',
    },
  };
  const edges = [{
    id: 'annotate-input',
    source: 'image-input',
    sourceHandle: 'image:out',
    target: 'annotate',
    targetHandle: 'image:in',
  }];
  const nodes = [imageInputNode, annotateNode];

  assert.deepEqual(getNodeImageOutput(annotateNode, 'image:out', null, nodes, edges), ['input/annotated.png']);

  imageInputNode.data.url = 'input/replacement.png';
  assert.deepEqual(getNodeImageOutput(annotateNode, 'image:out', null, nodes, edges), ['input/replacement.png']);

  imageInputNode.data.url = 'input/source.png';
  annotateNode.data.currentSourceImageKey = 'input/source.png|800x600';
  assert.deepEqual(getNodeImageOutput(annotateNode, 'image:out', null, nodes, edges), ['input/source.png']);
}

// Annotate eraser hit testing supports brush paths and shape bounding boxes.
{
  const brush = { type: 'brush', points: [10, 10, 100, 10], strokeWidth: 4 };
  const rect = { type: 'rect', x: 20, y: 20, width: 40, height: 30, strokeWidth: 2 };
  const ellipse = { type: 'ellipse', x: 80, y: 80, width: -30, height: -20, strokeWidth: 2 };
  const eraser = { type: 'eraser', points: [10, 50, 100, 50], strokeWidth: 10 };
  assert.equal(isAnnotationShapeHit(brush, { x: 50, y: 14 }, 4), true);
  assert.equal(isAnnotationShapeHit(brush, { x: 50, y: 40 }, 4), false);
  assert.equal(isAnnotationShapeHit(rect, { x: 30, y: 30 }, 4), true);
  assert.equal(isAnnotationShapeHit(ellipse, { x: 60, y: 70 }, 4), true);
  assert.equal(isAnnotationShapeHit(eraser, { x: 50, y: 52 }, 4), true);
  assert.deepEqual(eraseAnnotationObjectsAtPoint([brush, rect], { x: 50, y: 10 }, 4), [rect]);
}

// Local eraser is persisted as one annotation and uses destination-out on the annotation layer.
{
  const localEraser = createLocalEraserShape([10, 10, 20, 20], 24);
  assert.equal(localEraser.type, 'eraser');
  assert.deepEqual(localEraser.points, [10, 10, 20, 20]);
  assert.equal(localEraser.strokeWidth, 24);

  const operations = [];
  const context = {
    canvas: { width: 100, height: 100 },
    globalCompositeOperation: 'source-over',
    save() { operations.push(['save', this.globalCompositeOperation]); },
    restore() { operations.push(['restore', this.globalCompositeOperation]); this.globalCompositeOperation = 'source-over'; },
    clearRect() { operations.push(['clear']); },
    beginPath() { operations.push(['begin', this.globalCompositeOperation]); },
    moveTo() {},
    lineTo() {},
    stroke() { operations.push(['stroke', this.globalCompositeOperation]); },
    strokeRect() {},
    ellipse() {},
  };
  renderAnnotationLayer(context, [
    { type: 'brush', points: [0, 0, 30, 30], strokeWidth: 5, color: '#fff' },
    localEraser,
  ]);
  assert.deepEqual(
    operations.filter(([operation]) => operation === 'stroke').map(([, composite]) => composite),
    ['source-over', 'destination-out']
  );
  assert.equal(context.globalCompositeOperation, 'source-over');
}

// Undo/redo snapshots preserve both Local Eraser additions and Object Eraser deletions.
{
  const brush = { id: 'brush', type: 'brush', points: [0, 0, 30, 30], strokeWidth: 5 };
  const eraser = { id: 'eraser', type: 'eraser', points: [10, 10, 20, 20], strokeWidth: 12 };
  const localResult = pushAnnotationHistory([[brush]], 0, [brush, eraser]);
  assert.deepEqual(localResult.history[0], [brush]);
  assert.deepEqual(localResult.history[1], [brush, eraser]);

  const objectResult = pushAnnotationHistory(localResult.history, localResult.historyIndex, [eraser]);
  assert.deepEqual(objectResult.history[1], [brush, eraser]);
  assert.deepEqual(objectResult.history[2], [eraser]);
}

// Export erases only the annotation layer, then composites that layer over the untouched source image.
{
  const originalDocument = globalThis.document;
  const contexts = [];
  const createContext = () => {
    const operations = [];
    const context = {
      canvas: null,
      globalCompositeOperation: 'source-over',
      operations,
      save() {},
      restore() { this.globalCompositeOperation = 'source-over'; },
      clearRect() {},
      drawImage(source) { operations.push(['drawImage', source]); },
      scale() {},
      beginPath() { operations.push(['begin', this.globalCompositeOperation]); },
      moveTo() {},
      lineTo() {},
      stroke() { operations.push(['stroke', this.globalCompositeOperation]); },
      strokeRect() {},
      ellipse() {},
    };
    contexts.push(context);
    return context;
  };
  globalThis.document = {
    createElement() {
      const context = createContext();
      const canvas = {
        width: 0,
        height: 0,
        getContext: () => context,
        toDataURL: () => 'data:image/png;base64,test',
      };
      context.canvas = canvas;
      return canvas;
    },
  };

  const image = { naturalWidth: 100, naturalHeight: 80 };
  const result = exportAnnotatedImage(image, [
    { type: 'brush', points: [0, 0, 20, 20], strokeWidth: 5 },
    { type: 'eraser', points: [5, 5, 10, 10], strokeWidth: 8 },
  ]);
  assert.equal(result, 'data:image/png;base64,test');
  assert.equal(contexts[0].operations.some((operation) => operation[1] === 'destination-out'), false);
  assert.equal(contexts[1].operations.some((operation) => operation[1] === 'destination-out'), true);
  assert.equal(contexts[0].operations.filter(([operation]) => operation === 'drawImage').length, 2);

  if (originalDocument === undefined) delete globalThis.document;
  else globalThis.document = originalDocument;
}

console.log('nodeOutputs tests passed');
