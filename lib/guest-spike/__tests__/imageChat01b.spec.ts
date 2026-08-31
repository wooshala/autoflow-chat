// IMAGE-CHAT-01B — staff image send, clipboard paste, auth integrity tests.
// Run: node --test lib/guest-spike/__tests__/imageChat01b.spec.ts

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { validateGuestMessageContent } from '../guestMessagePost.ts';
import { GUEST_ATTACHMENT_MAX_BYTES } from '../guestAttachmentLimits.ts';
import { validateGuestAttachmentFile } from '../guestAttachmentValidation.ts';
import { validateGuestComposerFile } from '../guestComposerFileValidation.ts';
import { extractClipboardImage } from '../../customer-service/clipboardImage.ts';
import { buildMessageViewModel } from '../messageViewModel.ts';

const messagesRoute = readFileSync(
  fileURLToPath(new URL('../../../app/api/guest/[channel_key]/messages/route.ts', import.meta.url)),
  'utf8',
);
const apiSrc = readFileSync(
  fileURLToPath(new URL('../api.ts', import.meta.url)),
  'utf8',
);
const panelSrc = readFileSync(
  fileURLToPath(new URL('../../../components/guest-spike/GuestChatPanel.tsx', import.meta.url)),
  'utf8',
);
const inputSrc = readFileSync(
  fileURLToPath(new URL('../../../components/guest-spike/GuestMessageInput.tsx', import.meta.url)),
  'utf8',
);

function jpegBytes(): Uint8Array {
  return Uint8Array.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
  ]);
}

function handleGuestComposerPaste(event: Parameters<typeof extractClipboardImage>[0]) {
  const img = extractClipboardImage(event);
  if (!img) return { action: 'none' as const };
  const v = validateGuestComposerFile(img);
  if (!v.ok) return { action: 'error' as const, message: v.message };
  return { action: 'image' as const, file: img };
}

function mockPasteEvent(items: Array<{ kind: string; type: string; file?: { type: string; size: number } }>) {
  return {
    clipboardData: {
      items: items.map((i) => ({
        kind: i.kind,
        type: i.type,
        getAsFile: () => (i.file ? { ...i.file, name: 'paste.png' } : null),
      })),
    },
  };
}

test('1. valid staff auth context — image-only allowed in content validation', () => {
  const r = validateGuestMessageContent({ trimmedText: '', hasImage: true, sender: 'staff' });
  assert.equal(r.ok, true);
});

test('2. valid staff auth context — text+image allowed', () => {
  const r = validateGuestMessageContent({ trimmedText: '사진테스트', hasImage: true, sender: 'staff' });
  assert.equal(r.ok, true);
});

test('3. staff multipart without Bearer — resolvePostContext returns unauthorized', () => {
  assert.match(messagesRoute, /if \(sender === 'staff'\)/);
  assert.match(messagesRoute, /if \(!staff\) return \{ ok: false as const, response: NextResponse\.json\(\{ ok: false, error: 'UNAUTHORIZED' \}/);
});

test('4. Guest body sender=staff cannot impersonate — sender not read from body', () => {
  const postPaths = [
    messagesRoute.slice(messagesRoute.indexOf('async function postJsonMessage'), messagesRoute.indexOf('async function postMultipartMessage')),
    messagesRoute.slice(messagesRoute.indexOf('async function postMultipartMessage'), messagesRoute.indexOf('export async function POST')),
  ].join('\n');
  assert.equal(/body\.sender/.test(postPaths), false);
  assert.match(messagesRoute, /sender\s*=\s*req\.nextUrl\.searchParams\.get\('as'\)\s*===\s*'staff'/);
});

test('5. Guest text-only regression — JSON path unchanged', () => {
  const r = validateGuestMessageContent({ trimmedText: 'hello', hasImage: false, sender: 'guest' });
  assert.equal(r.ok, true);
  assert.match(apiSrc, /if \(input\.image\)/);
  assert.match(apiSrc, /Content-Type': 'application\/json'/);
});

test('6. Staff text-only regression — JSON when no image', () => {
  const r = validateGuestMessageContent({ trimmedText: 'reply', hasImage: false, sender: 'staff' });
  assert.equal(r.ok, true);
  assert.doesNotMatch(
    messagesRoute.slice(messagesRoute.indexOf('async function postMultipartMessage')),
    /if \(sender === 'staff'\)\s*\{\s*return NextResponse\.json\(\{ ok: false, error: 'FORBIDDEN' \}/,
  );
});

test('7. Guest image regression — guest multipart still allowed', () => {
  const r = validateGuestMessageContent({ trimmedText: '', hasImage: true, sender: 'guest' });
  assert.equal(r.ok, true);
  assert.match(messagesRoute, /postMultipartMessage/);
});

test('8. staff multipart route no longer blocks staff sender', () => {
  const multipart = messagesRoute.slice(
    messagesRoute.indexOf('async function postMultipartMessage'),
    messagesRoute.indexOf('export async function POST'),
  );
  assert.doesNotMatch(multipart, /sender === 'staff'[\s\S]{0,80}FORBIDDEN/);
  assert.match(multipart, /appendGuestMessageWithAttachments/);
});

test('9. staff image message viewModel renders attachment', () => {
  const vm = buildMessageViewModel(
    {
      original: '',
      original_lang: 'ko',
      translated: { en: 'photo' },
      sender: 'staff',
      attachments: [
        { id: 'a1', mime_type: 'image/jpeg', size_bytes: 100, sort_order: 0, url: 'https://signed.example/x' },
      ],
    },
    'ko',
    'en',
  );
  assert.equal(vm.attachments.length, 1);
  assert.equal(vm.attachments[0]!.url, 'https://signed.example/x');
});

test('10. signed attachment URL preserved in viewModel', () => {
  const url = 'https://storage.example/signed?token=abc';
  const vm = buildMessageViewModel(
    {
      original: 'caption',
      original_lang: 'ko',
      translated: { ja: 'キャプション' },
      attachments: [{ id: '1', mime_type: 'image/png', size_bytes: 50, sort_order: 0, url }],
    },
    'ko',
    'ja',
  );
  assert.equal(vm.attachments[0]!.url, url);
});

test('11. >4MB reject — server validation', () => {
  const r = validateGuestAttachmentFile({
    bytes: jpegBytes(),
    declaredMime: 'image/jpeg',
    declaredSize: GUEST_ATTACHMENT_MAX_BYTES + 1,
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.error, 'TOO_LARGE');
});

test('12. unsupported MIME reject — client composer', () => {
  const r = validateGuestComposerFile({ type: 'image/gif', size: 100 });
  assert.equal(r.ok, false);
});

test('13. magic-byte mismatch reject — server', () => {
  const r = validateGuestAttachmentFile({
    bytes: Uint8Array.from([0, 1, 2, 3]),
    declaredMime: 'image/jpeg',
    declaredSize: 4,
  });
  assert.equal(r.ok, false);
});

test('14. Storage success + RPC failure triggers cleanup', () => {
  const multipart = messagesRoute.slice(
    messagesRoute.indexOf('async function postMultipartMessage'),
    messagesRoute.indexOf('export async function POST'),
  );
  assert.match(multipart, /deleteGuestAttachmentObjectBestEffort/);
});

test('15. failed send does not append phantom message — client throws on !res.ok', () => {
  assert.match(apiSrc, /if \(!res\.ok\) throw new Error/);
  assert.match(inputSrc, /catch \{[\s\S]*setError\('전송에 실패했습니다/);
  const submitFn = inputSrc.slice(inputSrc.indexOf('const submit'), inputSrc.indexOf('return ('));
  const tryBlock = submitFn.slice(submitFn.indexOf('try {'), submitFn.indexOf('} catch'));
  assert.match(tryBlock, /setText\(''\)/);
  const catchBlock = submitFn.slice(submitFn.indexOf('} catch {'), submitFn.indexOf('} finally'));
  assert.doesNotMatch(catchBlock, /setText\(''\)/);
});

test('16. paste image → attachment state handler returns image', () => {
  const r = handleGuestComposerPaste(
    mockPasteEvent([{ kind: 'file', type: 'image/png', file: { type: 'image/png', size: 1024 } }]),
  );
  assert.equal(r.action, 'image');
});

test('17. paste normal text → none (no preventDefault contract)', () => {
  const r = handleGuestComposerPaste(
    mockPasteEvent([{ kind: 'string', type: 'text/plain', file: undefined }]),
  );
  assert.equal(r.action, 'none');
});

test('18. paste image with existing text — paste handler does not touch text', () => {
  assert.match(inputSrc, /if \(result\.action === 'none'\) return/);
  const onPaste = inputSrc.slice(inputSrc.indexOf('const onPaste'), inputSrc.indexOf('const submit'));
  assert.doesNotMatch(onPaste, /setText/);
});

test('19. second image paste → replace via selectFile', () => {
  assert.match(inputSrc, /setAttachment\(\(prev\) => \{[\s\S]*if \(prev\) URL\.revokeObjectURL/);
  const r1 = handleGuestComposerPaste(
    mockPasteEvent([{ kind: 'file', type: 'image/jpeg', file: { type: 'image/jpeg', size: 500 } }]),
  );
  const r2 = handleGuestComposerPaste(
    mockPasteEvent([{ kind: 'file', type: 'image/webp', file: { type: 'image/webp', size: 600 } }]),
  );
  assert.equal(r1.action, 'image');
  assert.equal(r2.action, 'image');
});

test('20. remove preview — removeAttachment clears state only', () => {
  assert.match(inputSrc, /const removeAttachment/);
  assert.match(inputSrc, /return null/);
  assert.doesNotMatch(
    inputSrc.slice(inputSrc.indexOf('const removeAttachment'), inputSrc.indexOf('const onPaste')),
    /fetch\(/,
  );
});

test('21. image send double-submit guard — sending disables send', () => {
  assert.match(inputSrc, /const canSend = .*!sending/);
  assert.match(inputSrc, /if \(\(!body && !attachment\) \|\| sending\) return/);
  assert.match(inputSrc, /disabled=\{!canSend\}/);
  assert.match(inputSrc, /setSending\(true\)/);
});

test('22. Staff image UI enabled in GuestChatPanel', () => {
  assert.doesNotMatch(panelSrc, /enableImages=\{ownSender === 'guest' && !asStaff\}/);
  assert.match(panelSrc, /enableImages/);
});

test('23. staff image-only skips language-not-selected in translateMessage', () => {
  assert.match(messagesRoute, /if \(isImageOnly\)/);
  const staffBlock = messagesRoute.slice(
    messagesRoute.indexOf('} else {', messagesRoute.indexOf("if (sender === 'guest')")),
    messagesRoute.indexOf('return { originalLang, translated };', messagesRoute.indexOf('} else {')),
  );
  assert.match(staffBlock, /if \(isImageOnly\)/);
});

test('24. client uses guest 4MB limit not ops 10MB clipboard limit', () => {
  assert.match(inputSrc, /validateGuestComposerFile/);
  assert.match(inputSrc, /handleGuestComposerPaste/);
  assert.doesNotMatch(inputSrc, /validateClipboardImage/);
  assert.doesNotMatch(inputSrc, /CLIPBOARD_IMAGE_MAX_BYTES/);
  const v = validateGuestComposerFile({ type: 'image/png', size: 5 * 1024 * 1024 });
  assert.equal(v.ok, false);
});

test('25. staff send uses multipart with ?as=staff when image present', () => {
  assert.match(apiSrc, /form\.append\('image'/);
  assert.match(apiSrc, /withStaff\(endpoint\(channelKey\), asStaff\)/);
  assert.match(apiSrc, /staffHeaders\(asStaff\)/);
});
