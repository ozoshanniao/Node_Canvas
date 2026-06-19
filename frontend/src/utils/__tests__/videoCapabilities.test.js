import assert from 'node:assert/strict';
import {
  buildVideoSchemaSnapshot,
  getHandleState,
  getInputCapability,
  getOutputCapability,
  getParameterSchema,
  getStableVideoHandles,
  getVideoCapability,
  isHandleRequired,
  isHandleSupported,
} from '../videoCapabilities.js';

const capability = {
  schemaVersion: 1,
  provider: 'kling',
  model: 'kling-v3',
  taskTypes: ['text-to-video', 'image-to-video'],
  inputCapabilities: {
    'text:prompt': {
      type: 'text',
      role: 'prompt',
      label: 'Prompt',
      required: true,
      supported: true,
    },
    'image:firstFrame': {
      type: 'image',
      role: 'first_frame',
      label: 'First Frame',
      required: false,
      supported: true,
    },
  },
  outputCapabilities: {
    'video:out': {
      type: 'video',
      role: 'generated_video',
      label: 'Video Out',
      required: true,
      supported: true,
    },
  },
  parameters: {
    negativePrompt: {
      type: 'text',
      group: 'advanced',
      default: '',
    },
    duration: {
      type: 'select',
      group: 'basic',
      options: ['5s', '10s'],
      default: '5s',
    },
    seed: {
      type: 'integer',
      group: 'advanced',
      default: null,
    },
  },
  quickParams: ['duration'],
  advancedParams: ['seed'],
};

assert.deepEqual(getStableVideoHandles(), {
  inputs: [
    'text:prompt',
    'image:firstFrame',
    'image:lastFrame',
    'image:references',
    'video:references',
    'audio:references',
    'omniParams:in',
  ],
  outputs: ['video:out'],
});

const snapshot = buildVideoSchemaSnapshot(capability);
assert.equal(snapshot.schemaVersion, 1);
assert.equal(snapshot.provider, 'kling');
assert.equal(snapshot.parameterSummary.negativePrompt.group, 'advanced');
assert.equal(snapshot.adapterHints, undefined);
assert.equal(snapshot.hiddenParams, undefined);
assert.equal(snapshot.parameters, undefined);

assert.equal(getVideoCapability([capability], 'kling', 'kling-v3'), capability);
assert.equal(getVideoCapability([capability], 'kling', 'kling-v3', 'image-to-video'), capability);
assert.equal(getVideoCapability([capability], 'kling', 'missing'), null);

assert.equal(getInputCapability(capability, 'image:firstFrame').role, 'first_frame');
assert.equal(getOutputCapability(capability, 'video:out').role, 'generated_video');

const firstFrameState = getHandleState(capability, 'image:firstFrame');
assert.equal(firstFrameState.supported, true);
assert.equal(firstFrameState.required, false);
assert.equal(firstFrameState.status, 'optional');

const promptState = getHandleState(capability, 'text:prompt');
assert.equal(promptState.supported, true);
assert.equal(promptState.required, true);
assert.equal(promptState.status, 'required');

const lastFrameState = getHandleState(capability, 'image:lastFrame');
assert.equal(lastFrameState.supported, false);
assert.equal(lastFrameState.status, 'unsupported');

assert.equal(getHandleState(null, 'image:firstFrame').status, 'unsupported');
assert.equal(getHandleState(null, 'video:out').status, 'required');
assert.equal(isHandleSupported(capability, 'image:firstFrame'), true);
assert.equal(isHandleSupported(capability, 'image:lastFrame'), false);
assert.equal(isHandleRequired(capability, 'text:prompt'), true);
assert.equal(getParameterSchema(capability, 'negativePrompt').group, 'advanced');
assert.deepEqual(getParameterSchema(capability, 'duration').options, ['5s', '10s']);
assert.equal(getParameterSchema(capability, 'seed').group, 'advanced');
assert.equal(getParameterSchema(capability, 'missing'), null);

console.log('videoCapabilities tests passed');
