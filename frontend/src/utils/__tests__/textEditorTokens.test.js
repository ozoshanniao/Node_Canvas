import assert from 'node:assert/strict';
import {
  deleteEditorPartAt,
  insertAutocompleteMediaTokenText,
  isTextVarTokenName,
  mediaTokenToText,
  plainTextToEditorParts,
  serializeEditorParts,
  textVarTokenToText,
  tokenNameToText,
} from '../textEditorTokens.js';

assert.equal(mediaTokenToText('image_1'), '@image_1', 'media token text should use @ prefix');

assert.equal(textVarTokenToText('shot1'), '@shot1', 'text-var token text should use @ prefix');

['shot1', 'shot_1', 'camera_closeup', 'look-1'].forEach((name) => {
  assert.equal(isTextVarTokenName(name), true, `${name} should be a valid text-var token name`);
});

['1shot', 'shot 1', '镜头1'].forEach((name) => {
  assert.equal(isTextVarTokenName(name), false, `${name} should be an invalid text-var token name`);
});

assert.equal(tokenNameToText('image_1', 'media'), '@image_1', 'media token name should serialize correctly');
assert.equal(tokenNameToText('shot1', 'text-var'), '@shot1', 'text-var token name should serialize correctly');

assert.equal(
  serializeEditorParts([{ type: 'token', name: 'image_1' }]),
  '@image_1',
  'token model should serialize to plain text media placeholder'
);

assert.equal(
  serializeEditorParts([
    { type: 'text', text: 'Use ' },
    { type: 'token', name: 'image_1' },
    { type: 'text', text: ' with manual @图片1' },
  ]),
  'Use @image_1 with manual @图片1',
  'mixed token and text content should serialize without changing ordinary text'
);

assert.deepEqual(
  plainTextToEditorParts('manual @image_1 and @图片1'),
  [{ type: 'text', text: 'manual @image_1 and @图片1' }],
  'plain text loading should not tokenize manually typed placeholders'
);

assert.equal(
  insertAutocompleteMediaTokenText('Use @i today', 4, 6, 'image_1'),
  'Use @image_1 today',
  'autocomplete insertion should replace the active @ query with a media token text value'
);

assert.equal(
  serializeEditorParts(deleteEditorPartAt([
    { type: 'text', text: 'A ' },
    { type: 'token', name: 'video_1' },
    { type: 'text', text: ' B' },
  ], 1)),
  'A  B',
  'deleting a token part should remove the whole media placeholder'
);

console.log('textEditorTokens tests passed');
