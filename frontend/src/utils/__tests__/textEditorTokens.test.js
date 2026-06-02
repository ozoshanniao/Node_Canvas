import assert from 'node:assert/strict';
import {
  createEditorTokenMetadata,
  deleteEditorPartAt,
  editorPartsFromTextAndTokens,
  insertAutocompleteMediaTokenText,
  isTextVarTokenName,
  mediaTokenToText,
  normalizeEditorTokens,
  normalizeTokenValue,
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
assert.equal(normalizeTokenValue('@character'), 'character', 'token value should drop a leading @');
assert.equal(normalizeTokenValue(' character '), 'character', 'token value should trim surrounding whitespace');
assert.equal(normalizeTokenValue('\u200Bcharacter'), 'character', 'token value should remove zero-width characters');
assert.equal(normalizeTokenValue('\u00A0character\u00A0'), 'character', 'token value should normalize nbsp');
assert.equal(normalizeTokenValue('@ character'), 'character', 'token value should remove accidental whitespace after @');
assert.equal(tokenNameToText('@ character', 'text-var'), '@character', 'token text should be canonical even when metadata is dirty');

{
  const token = createEditorTokenMetadata({
    id: 'token-1',
    type: 'text-var',
    value: 'shot1',
    start: 4,
  });
  assert.deepEqual(token, {
    id: 'token-1',
    type: 'text-var',
    value: 'shot1',
    start: 4,
    end: 10,
  }, 'autocomplete token insertion should create text-var metadata');
}

{
  const value = 'Use @shot1';
  const tokens = [{ id: 'token-1', type: 'text-var', value: 'shot1', start: 4, end: 10 }];
  assert.deepEqual(editorPartsFromTextAndTokens(value, tokens), [
    { type: 'text', text: 'Use ' },
    { id: 'token-1', type: 'token', tokenType: 'text-var', value: 'shot1', start: 4, end: 10 },
  ], 'reload should recover token parts from value and metadata');
}

{
  const value = 'Use @character';
  const tokens = [{ id: 'token-character', type: 'text-var', value: 'character', start: 4, end: 14 }];
  const parts = editorPartsFromTextAndTokens(value, tokens);
  assert.equal(parts.some((part) => part.type === 'token' && part.tokenType === 'text-var' && part.value === 'character'), true);
  assert.equal(serializeEditorParts(parts), value, 'valid metadata should preserve the source text exactly');
}

{
  const value = 'Use @character';
  const tokens = [{ id: 'token-character', type: 'text-var', value: 'character', start: 5, end: 15 }];
  const parts = editorPartsFromTextAndTokens(value, tokens);
  assert.deepEqual(parts, [{ type: 'text', text: value }], 'invalid metadata should fall back to plain text');
  assert.equal(serializeEditorParts(parts), value, 'invalid metadata must not swallow token text');
}

{
  const value = 'Use @character';
  const tokens = [{ id: 'token-character', type: 'text-var', value: '@character', start: 4, end: 14 }];
  assert.deepEqual(normalizeEditorTokens(value, tokens), [
    { id: 'token-character', type: 'text-var', value: 'character', start: 4, end: 14 },
  ], 'metadata value with @ prefix should normalize to a bare token value');
  assert.equal(serializeEditorParts(editorPartsFromTextAndTokens(value, tokens)), value);
}

{
  const value = '@image_1 prompt';
  const tokens = [{ id: 'media-1', type: 'media', value: 'image_1', start: 0, end: 8 }];
  const parts = editorPartsFromTextAndTokens(value, tokens);
  assert.deepEqual(parts, [
    { id: 'media-1', type: 'token', tokenType: 'media', value: 'image_1', start: 0, end: 8 },
    { type: 'text', text: ' prompt' },
  ], 'TextNode media token metadata should recover a media token part on reload');
  assert.equal(serializeEditorParts(parts), value);
}

{
  const value = '@image_1 prompt';
  const tokens = [{ id: 'media-1', type: 'media', value: 'image_2', start: 0, end: 8 }];
  const parts = editorPartsFromTextAndTokens(value, tokens);
  assert.deepEqual(parts, [{ type: 'text', text: value }], 'invalid TextNode media metadata should fall back to plain text');
  assert.equal(serializeEditorParts(parts), value, 'invalid TextNode media metadata must not swallow text');
}

{
  const value = '@image_1';
  const tokens = [{ id: 'media-1', type: 'media', value: '@image_1', start: 0, end: 8 }];
  assert.deepEqual(normalizeEditorTokens(value, tokens), [
    { id: 'media-1', type: 'media', value: 'image_1', start: 0, end: 8 },
  ], 'TextNode media metadata with @ value should normalize and recover');
}

assert.deepEqual(
  editorPartsFromTextAndTokens('@image_1 prompt', undefined),
  [{ type: 'text', text: '@image_1 prompt' }],
  'manual media placeholders without textTokens should stay plain text'
);

assert.deepEqual(
  normalizeEditorTokens(' prompt', [{ id: 'media-1', type: 'media', value: 'image_1', start: 0, end: 8 }]),
  [],
  'deleted media token text should clear TextNode media metadata'
);

{
  const value = '请为模特@character的高级时装摄影';
  const tokens = [{ id: 'token-character', type: 'text-var', value: 'character', start: 4, end: 14 }];
  assert.equal(
    serializeEditorParts(editorPartsFromTextAndTokens(value, tokens)),
    value,
    'reload with adjacent Chinese text should preserve the exact template'
  );
}

assert.deepEqual(
  editorPartsFromTextAndTokens('Use @shot1', undefined),
  [{ type: 'text', text: 'Use @shot1' }],
  'old projects without token metadata should not auto-tokenize plain text'
);

assert.equal(
  serializeEditorParts(editorPartsFromTextAndTokens('Use @character', undefined)),
  'Use @character',
  'manual text-var references without metadata should stay as plain text'
);

assert.deepEqual(
  normalizeEditorTokens('Use @shot1', [{ id: 'token-1', type: 'text-var', value: 'shot2', start: 4, end: 10 }]),
  [],
  'metadata that does not match value should be discarded safely'
);

assert.equal(
  serializeEditorParts(editorPartsFromTextAndTokens(
    'Use @shot1',
    [{ id: 'token-1', type: 'text-var', value: 'shot2', start: 4, end: 10 }]
  )),
  'Use @shot1',
  'discarding invalid metadata should not change the source value'
);

assert.deepEqual(
  normalizeEditorTokens('Use ', [{ id: 'token-1', type: 'text-var', value: 'shot1', start: 4, end: 10 }]),
  [],
  'deleted token text should remove token metadata'
);

assert.equal(
  serializeEditorParts([{ type: 'token', tokenType: 'text-var', name: 'shot1' }]),
  '@shot1',
  'text-var token parts should serialize to plain text'
);

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
