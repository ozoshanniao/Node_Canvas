import assert from 'node:assert/strict';
import {
  getImageProviderOptions,
  getImageModelOptions,
  getImageModelSwitchPatch,
  getImageResolutionOptions,
  normalizeImageGenerationSettings,
} from '../imageGenerationOptions.js';


const kieRegistry = {
  providers: {
    KIE: ['Nano Banana Pro (KIE)', 'Nano Banana 2 (KIE)', 'GPT Image 2 (KIE)'],
  },
  models: {
    'Nano Banana Pro (KIE)': {
      id: 'nano-banana-pro',
      label: 'Nano Banana Pro (KIE)',
      ratios: ['1:1', '16:9'],
      resolutions: ['1K', '2K', '4K'],
      supports_reference: true,
    },
    'Nano Banana 2 (KIE)': {
      id: 'nano-banana-2',
      label: 'Nano Banana 2 (KIE)',
      ratios: ['auto', '1:1', '16:9'],
      resolutions: ['1K', '2K', '4K'],
      supports_reference: true,
    },
    'GPT Image 2 (KIE)': {
      id: 'gpt-image-2',
      label: 'GPT Image 2 (KIE)',
      ratios: ['auto', '1:1', '16:9'],
      resolutions: ['1K', '2K', '4K'],
      supports_reference: true,
      taskTypes: ['text-to-image', 'image-to-image'],
      internalImageInputField: 'input_urls',
      maxImages: 16,
      constraints: {
        autoAspectRatioResolution: '1K',
        squareAspectRatioDisallows: ['4K'],
      },
    },
  },
};

{
  const patch = getImageModelSwitchPatch(
    {
      provider: 'Yunwu',
      model: 'GPT-2',
      aspectRatio: '16:9',
      ratio: '16:9',
      resolution: '4K',
      n: 4,
      quality: 'high',
    },
    'Yunwu',
    'Nano 2'
  );

  assert.equal(patch.model, 'Nano 2');
  assert.equal(patch.n, undefined);
  assert.equal(patch.quality, undefined);
  assert.equal(patch.aspectRatio, '16:9');
  assert.equal(patch.ratio, '16:9');
  assert.equal(patch.resolution, '4K');
}

{
  const patch = getImageModelSwitchPatch(
    {
      provider: 'Yunwu',
      model: 'Nano 2',
      aspectRatio: '16:9',
      ratio: '16:9',
      resolution: '2K',
    },
    'Yunwu',
    'GPT-2'
  );

  assert.equal(patch.model, 'GPT-2');
  assert.equal(patch.n, 1);
  assert.equal(patch.quality, 'auto');
  assert.equal(patch.aspectRatio, '16:9');
  assert.equal(patch.resolution, '2K');
}

{
  const settings = normalizeImageGenerationSettings({
    provider: 'Yunwu',
    model: 'GPT-2',
    aspectRatio: '1:8',
    ratio: '1:8',
    resolution: 'bad-resolution',
  });

  assert.equal(settings.aspectRatio, '1:1');
  assert.equal(settings.ratio, '1:1');
  assert.equal(settings.resolution, '1K');
}


{
  assert.deepEqual(
    getImageProviderOptions({ providers: { Google: ['Nano Pro'], Yunwu: ['Nano 2'] }, models: {} }),
    [{ id: 'Google', label: 'Google Cloud' }, { id: 'Yunwu', label: 'Yunwu' }]
  );

  const googleSettings = normalizeImageGenerationSettings({ provider: 'Google', model: 'Nano Pro' }, {
    providers: { Google: ['Nano Pro'], Yunwu: ['Nano 2'] },
    models: { 'Nano Pro': { ratios: ['1:1'], resolutions: ['1K'] }, 'Nano 2': { ratios: ['1:1'], resolutions: ['1K'] } },
  });
  assert.equal(googleSettings.provider, 'Google');

  assert.deepEqual(
    getImageModelOptions('KIE', kieRegistry).map((option) => option.id),
    ['Nano Banana Pro (KIE)', 'Nano Banana 2 (KIE)', 'GPT Image 2 (KIE)']
  );

  const t2iLegacy = normalizeImageGenerationSettings({ provider: 'KIE', model: 'gpt-image-2-text-to-image' }, kieRegistry);
  assert.equal(t2iLegacy.model, 'GPT Image 2 (KIE)');
  const i2iLegacy = normalizeImageGenerationSettings({ provider: 'KIE', model: 'gpt-image-2-image-to-image' }, kieRegistry);
  assert.equal(i2iLegacy.model, 'GPT Image 2 (KIE)');
  const labelLegacy = normalizeImageGenerationSettings({ provider: 'KIE', model: 'GPT Image 2 I2I (KIE)' }, kieRegistry);
  assert.equal(labelLegacy.model, 'GPT Image 2 (KIE)');

  const auto = normalizeImageGenerationSettings({ provider: 'KIE', model: 'GPT Image 2 (KIE)', aspectRatio: 'auto', resolution: '4K' }, kieRegistry);
  assert.equal(auto.resolution, '1K');
  assert.deepEqual(getImageResolutionOptions('KIE', 'GPT Image 2 (KIE)', kieRegistry, auto).map((option) => option.id), ['1K']);

  const square = normalizeImageGenerationSettings({ provider: 'KIE', model: 'GPT Image 2 (KIE)', aspectRatio: '1:1', resolution: '4K' }, kieRegistry);
  assert.notEqual(square.resolution, '4K');
  assert.deepEqual(getImageResolutionOptions('KIE', 'GPT Image 2 (KIE)', kieRegistry, square).map((option) => option.id), ['1K', '2K']);

  const fourK = normalizeImageGenerationSettings({ provider: 'KIE', model: 'GPT Image 2 (KIE)', aspectRatio: '1:1', resolution: '4K' }, kieRegistry);
  assert.notEqual(fourK.aspectRatio === '1:1' && fourK.resolution === '4K', true);
}


console.log('imageGenerationOptions tests passed');
