import assert from 'node:assert/strict';
import {
  getImageModelSwitchPatch,
  normalizeImageGenerationSettings,
} from '../imageGenerationOptions.js';

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

console.log('imageGenerationOptions tests passed');
