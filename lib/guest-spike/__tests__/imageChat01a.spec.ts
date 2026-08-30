// IMAGE-CHAT-01A — regression, attachment validation, and security contract tests.
// Run: node --test lib/guest-spike/__tests__/imageChat01a.spec.ts

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  GUEST_MESSAGE_PREVIEW_IMAGE,
  buildGuestMessagePreview,
} from '../guestMessagePreview.ts';
import {
  imageOnlyOriginalLang,
  parseGuestMessagePostBody,
  validateGuestMessagePostContent,
} from '../guestMessagePost.ts';
import {
  buildGuestAttachmentStoragePath,
  detectGuestImageMime,
  isGuestAttachmentStoragePathForSession,
  validateGuestAttachmentFile,
} from '../guestAttachmentValidation.ts';
import { buildMessageViewModel } from '../messageViewModel.ts';

const SESSION_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const UPLOAD_A = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function jpegBytes(): Uint8Array {
  return Uint8Array.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  ]);
}

function pngBytes(): Uint8Array {
  return Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
}

function webpBytes(): Uint8Array {
  const buf = new Uint8Array(12);
  buf.set([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00], 0);
  buf.set([0x57, 0x45, 0x42, 0x50], 8);
  return buf;
}

const messagesRoute = readFileSync(
  fileURLToPath(new URL('../../../app/api/guest/[channel_key]/messages/route.ts', import.meta.url)),
  'utf8',
);

test('1. legacy Guest text POST accepted — empty without attachments rejected', () => {
  const r = validateGuestMessagePostContent({ trimmedText: 'hello', attachmentCount: 0, sender: 'guest' });
  assert.equal(r.ok, true);
  const empty = validateGuestMessagePostContent({ trimmedText: '', attachmentCount: 0, sender: 'guest' });
  assert.equal(empty.ok, false);
  if (!empty.ok) assert.equal(empty.error, 'EMPTY');
});

test('2. legacy Staff text POST — staff attachments forbidden', () => {
  const r = validateGuestMessagePostContent({ trimmedText: 'reply', attachmentCount: 0, sender: 'staff' });
  assert.equal(r.ok, true);
  const withAttach = validateGuestMessagePostContent({ trimmedText: 'x', attachmentCount: 1, sender: 'staff' });
  assert.equal(withAttach.ok, false);
});

test('3. text-only serialization unchanged — attachments normalize to []', () => {
  const vm = buildMessageViewModel(
    { original: 'hello', original_lang: 'en', translated: { ko: '안녕' } },
    'ko',
    'en',
  );
  assert.deepEqual(vm.attachments, []);
  assert.equal(vm.showText, true);
});

test('4. text-only viewModel unchanged for standard guest→staff', () => {
  const vm = buildMessageViewModel(
    { original: 'こんにちは', original_lang: 'ja', translated: { ko: '안녕하세요' } },
    'ko',
    'ja',
  );
  assert.equal(vm.displayText, '안녕하세요');
  assert.equal(vm.showOriginal, true);
});

test('5. text-only preview unchanged', () => {
  assert.equal(
    buildGuestMessagePreview({ original_text: 'hello', translated_json: { ko: '안녕' } }),
    '안녕',
  );
});

test('6. image-only skips translation path in route (detectAndTranslate guarded)', () => {
  assert.match(messagesRoute, /isImageOnly/);
  assert.match(messagesRoute, /if \(isImageOnly\)/);
  const imageOnlyBlock = messagesRoute.slice(
    messagesRoute.indexOf('if (isImageOnly)'),
    messagesRoute.indexOf('} else {', messagesRoute.indexOf('if (isImageOnly)')),
  );
  assert.doesNotMatch(imageOnlyBlock, /detectAndTranslateToKorean/);
});

test('7. empty text + no attachment → 400 EMPTY', () => {
  const parsed = parseGuestMessagePostBody({ text: '   ' });
  const v = validateGuestMessagePostContent({
    trimmedText: parsed.trimmedText,
    attachmentCount: parsed.attachmentRefs.length,
    sender: 'guest',
  });
  assert.equal(v.ok, false);
});

test('8. image-only → accepted', () => {
  const parsed = parseGuestMessagePostBody({
    text: '',
    attachments: [{ upload_token: UPLOAD_A }],
  });
  const v = validateGuestMessagePostContent({
    trimmedText: parsed.trimmedText,
    attachmentCount: parsed.attachmentRefs.length,
    sender: 'guest',
  });
  assert.equal(v.ok, true);
});

test('9. image-only original_lang uses session language fallback', () => {
  assert.equal(imageOnlyOriginalLang('ja'), 'ja');
  assert.equal(imageOnlyOriginalLang(null), 'en');
});

test('10. image preview → 📷 사진', () => {
  assert.equal(
    buildGuestMessagePreview({ original_text: '', has_attachments: true }),
    GUEST_MESSAGE_PREVIEW_IMAGE,
  );
  assert.equal(
    buildGuestMessagePreview({
      original_text: 'text first',
      has_attachments: true,
      translated_json: { ko: '텍스트' },
    }),
    '텍스트',
  );
});

test('11. deleted text message viewModel unchanged', () => {
  const vm = buildMessageViewModel(
    { original: 'x', original_lang: 'ko', translated: {}, is_deleted: true },
    'ko',
    'en',
  );
  assert.equal(vm.isDeleted, true);
  assert.equal(vm.attachments.length, 0);
});

test('12. deleted image message safe — no attachment URLs shown', () => {
  const vm = buildMessageViewModel(
    {
      original: '',
      original_lang: 'ja',
      translated: {},
      is_deleted: true,
      attachments: [{ id: '1', mime_type: 'image/png', size_bytes: 1, sort_order: 0, url: 'http://x' }],
    },
    'ko',
    'ja',
  );
  assert.equal(vm.isDeleted, true);
  assert.equal(vm.attachments.length, 0);
});

test('valid JPEG accepted', () => {
  const r = validateGuestAttachmentFile({
    bytes: jpegBytes(),
    declaredMime: 'image/jpeg',
    declaredSize: jpegBytes().length,
  });
  assert.equal(r.ok, true);
});

test('valid PNG accepted', () => {
  const r = validateGuestAttachmentFile({
    bytes: pngBytes(),
    declaredMime: 'image/png',
    declaredSize: pngBytes().length,
  });
  assert.equal(r.ok, true);
});

test('valid WebP accepted', () => {
  const r = validateGuestAttachmentFile({
    bytes: webpBytes(),
    declaredMime: 'image/webp',
    declaredSize: webpBytes().length,
  });
  assert.equal(r.ok, true);
});

test('oversize reject', () => {
  const r = validateGuestAttachmentFile({
    bytes: jpegBytes(),
    declaredMime: 'image/jpeg',
    declaredSize: 11 * 1024 * 1024,
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.error, 'TOO_LARGE');
});

test('SVG reject', () => {
  const svg = Uint8Array.from(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'));
  const r = validateGuestAttachmentFile({
    bytes: svg,
    declaredMime: 'image/svg+xml',
    declaredSize: svg.length,
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.error, 'SVG_DENIED');
});

test('non-image reject', () => {
  const r = validateGuestAttachmentFile({
    bytes: Uint8Array.from([0, 1, 2, 3]),
    declaredMime: 'image/jpeg',
    declaredSize: 4,
  });
  assert.equal(r.ok, false);
});

test('storage path session isolation', () => {
  const path = buildGuestAttachmentStoragePath(SESSION_A, UPLOAD_A, 'jpg');
  assert.equal(isGuestAttachmentStoragePathForSession(path, SESSION_A), true);
  assert.equal(isGuestAttachmentStoragePathForSession(path, 'cccccccc-cccc-cccc-cccc-cccccccccccc'), false);
});

test('forged storage_path pattern rejected by helper', () => {
  assert.equal(isGuestAttachmentStoragePathForSession('evil/evil.jpg', SESSION_A), false);
});

test('messages route validates pending uploads (not raw storage_path from client)', () => {
  assert.match(messagesRoute, /validatePendingGuestUploads/);
  assert.match(messagesRoute, /upload_token/);
  assert.doesNotMatch(messagesRoute, /body\.storage_path/);
});

test('upload route rejects staff uploads in Phase A', () => {
  const uploadRoute = readFileSync(
    fileURLToPath(
      new URL('../../../app/api/guest/[channel_key]/attachments/upload/route.ts', import.meta.url),
    ),
    'utf8',
  );
  assert.match(uploadRoute, /as.*staff.*FORBIDDEN|FORBIDDEN.*staff/s);
});

test('image-only preview in guestChannelSummary guestPreview path', async () => {
  const { buildChannelSummaries } = await import('../guestChannelSummary.ts');
  const summaries = buildChannelSummaries(
    [{ id: SESSION_A, channel_key: 'room-101', language_code: 'ja', language_source: 'user_selected' }],
    [
      {
        id: 'msg-1',
        session_id: SESSION_A,
        sender: 'guest',
        created_at: '2026-08-30T00:00:00.000Z',
        original_text: '',
        translated_json: {},
        has_attachments: true,
      },
    ],
  );
  assert.equal(summaries[0]!.latest_guest_message_preview, GUEST_MESSAGE_PREVIEW_IMAGE);
});
