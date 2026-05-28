import assert from 'node:assert/strict';
import { normalizeImageOutputItem } from '../outputImages.js';

// 1. 上游 image 为 string 时，归一化后 url 仍然是 string，且 sourceNodeId 正确
{
  const result = normalizeImageOutputItem('input/ref.png', 'node-1');
  assert.deepEqual(result, {
    url: 'input/ref.png',
    sourceNodeId: 'node-1',
  });
}

// 2. 上游 image 为 VideoNode lastFrame rich object 时，归一化后 url 正确取得，其它属性无损保留
{
  const lastFrameObj = {
    type: 'image',
    sourceType: 'generated',
    url: 'generation/seedance_task_last_frame.png',
    filePath: 'generation/seedance_task_last_frame.png',
    filename: 'seedance_task_last_frame.png',
    mimeType: 'image/png',
    remoteUrl: 'https://seedance.test/last.png',
    // 故意增加同名 sourceNodeId 以测试覆盖逻辑
    sourceNodeId: 'wrong-node-id',
  };

  const result = normalizeImageOutputItem(lastFrameObj, 'video-node-real');

  assert.equal(result.url, 'generation/seedance_task_last_frame.png');
  assert.equal(result.sourceNodeId, 'video-node-real');
  assert.equal(result.filePath, 'generation/seedance_task_last_frame.png');
  assert.equal(result.sourceType, 'generated');
  assert.equal(result.mimeType, 'image/png');
  assert.equal(result.filename, 'seedance_task_last_frame.png');
  assert.equal(result.remoteUrl, 'https://seedance.test/last.png');
  assert.equal(result.type, 'image');
}

// 3. 上游 image rich object 没有 url 只有 filePath 时
{
  const testObj = {
    filePath: 'generation/only_filepath.png',
  };
  const result = normalizeImageOutputItem(testObj, 'node-2');
  assert.equal(result.url, 'generation/only_filepath.png');
}

// 4. 上游 image rich object 没有 url/filePath 只有 path 时
{
  const testObj = {
    path: 'generation/only_path.png',
  };
  const result = normalizeImageOutputItem(testObj, 'node-3');
  assert.equal(result.url, 'generation/only_path.png');
}

// 5. 提供空或者无效输入时，归一化后 url 字段为 ''
{
  assert.deepEqual(normalizeImageOutputItem(null, 'node-x'), { url: '', sourceNodeId: 'node-x' });
  assert.deepEqual(normalizeImageOutputItem(undefined, 'node-y'), { url: '', sourceNodeId: 'node-y' });
  assert.deepEqual(normalizeImageOutputItem({}, 'node-z'), { url: '', sourceNodeId: 'node-z' });
}

console.log('outputImages tests passed');
