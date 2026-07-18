// Phase 1B clipboard image utility tests — pure logic (no DOM). Run: node --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  extractClipboardImage,
  clipboardHasText,
  validateClipboardImage,
  createClipboardImagePreview,
  formatImageSize,
  CLIPBOARD_IMAGE_MAX_BYTES,
  type ClipboardEventLike,
  type ClipboardFileLike,
} from '../clipboardImage.ts';

function file(type: string, size = 1000, name = 'x'): ClipboardFileLike {
  return { type, size, name };
}
function ev(parts: {
  items?: Array<{ kind: string; type: string; file?: ClipboardFileLike }>;
  files?: ClipboardFileLike[];
  text?: string;
}): ClipboardEventLike {
  return {
    clipboardData: {
      items: parts.items?.map((i) => ({
        kind: i.kind,
        type: i.type,
        getAsFile: () => i.file ?? null,
      })) ?? null,
      files: parts.files ?? null,
      getData: (fmt: string) => (fmt.startsWith('text') ? (parts.text ?? '') : ''),
    },
  };
}

test('extract: png from clipboard items', () => {
  const f = file('image/png');
  const got = extractClipboardImage(ev({ items: [{ kind: 'file', type: 'image/png', file: f }] }));
  assert.equal(got, f);
});

test('extract: image from files fallback', () => {
  const f = file('image/jpeg');
  assert.equal(extractClipboardImage(ev({ files: [f] })), f);
});

test('extract: no image → null (text paste must be unaffected)', () => {
  assert.equal(extractClipboardImage(ev({ items: [{ kind: 'string', type: 'text/plain' }], text: 'hi' })), null);
  assert.equal(extractClipboardImage(ev({})), null);
  assert.equal(extractClipboardImage({ clipboardData: null }), null);
});

test('clipboardHasText: detects mixed image+text', () => {
  assert.equal(clipboardHasText(ev({ items: [{ kind: 'string', type: 'text/plain' }], text: 'hi' })), true);
  assert.equal(clipboardHasText(ev({ files: [file('image/png')] })), false);
});

test('validate: accepts png/jpeg, rejects webp/other/oversize/non-image', () => {
  assert.equal(validateClipboardImage(file('image/png')).ok, true);
  assert.equal(validateClipboardImage(file('image/jpeg')).ok, true);
  const webp = validateClipboardImage(file('image/webp'));
  assert.equal(webp.ok, false);
  if (!webp.ok) assert.equal(webp.reason, 'unsupported_type');
  const big = validateClipboardImage(file('image/png', CLIPBOARD_IMAGE_MAX_BYTES + 1));
  assert.equal(big.ok, false);
  if (!big.ok) assert.equal(big.reason, 'too_large');
  const txt = validateClipboardImage(file('text/plain'));
  assert.equal(txt.ok, false);
  if (!txt.ok) assert.equal(txt.reason, 'not_image');
});

test('preview: create + idempotent revoke (injected deps, no DOM)', () => {
  const created: string[] = [];
  const revoked: string[] = [];
  const p = createClipboardImagePreview({ size: 1 } as unknown as Blob, {
    createObjectURL: () => {
      const u = `blob:mock-${created.length}`;
      created.push(u);
      return u;
    },
    revokeObjectURL: (u) => revoked.push(u),
  });
  assert.match(p.url, /^blob:mock-/);
  p.revoke();
  p.revoke(); // idempotent
  assert.equal(created.length, 1);
  assert.equal(revoked.length, 1, 'revoke called exactly once despite double call');
});

test('formatImageSize', () => {
  assert.equal(formatImageSize(500), '500 B');
  assert.equal(formatImageSize(2048), '2 KB');
  assert.equal(formatImageSize(3 * 1024 * 1024), '3.0 MB');
});
