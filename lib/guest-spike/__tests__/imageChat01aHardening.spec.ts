// IMAGE-CHAT-01A PRE-PROD hardening — RPC atomicity contract + orphan state tests.
// Run: node --test lib/guest-spike/__tests__/imageChat01aHardening.spec.ts

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  isOrphanImageOnlyMessage,
  isPendingUploadAbandoned,
  isPendingUploadConsumed,
  isPendingUploadUnused,
  ORPHAN_IMAGE_ONLY_MESSAGES_SQL,
  ABANDONED_PENDING_UPLOADS_SQL,
} from '../guestAttachmentOrphans.ts';
import { parseGuestAttachmentRpcError } from '../guestAttachmentRpc.ts';

const storeSrc = readFileSync(
  fileURLToPath(new URL('../store.ts', import.meta.url)),
  'utf8',
);
const rpcMigration = readFileSync(
  fileURLToPath(
    new URL('../../../supabase/migrations/20260830130000_guest_chat_message_attachments_rpc.sql', import.meta.url),
  ),
  'utf8',
);

test('Crash window A (pre-RPC): claim→message→crash left orphan — RPC removes early claim', () => {
  assert.doesNotMatch(storeSrc, /claimPendingGuestUploads/);
  assert.match(storeSrc, /create_guest_message_with_attachments/);
});

test('RPC migration uses single transaction with row locks', () => {
  assert.match(rpcMigration, /create or replace function public\.create_guest_message_with_attachments/i);
  assert.match(rpcMigration, /for update/i);
  assert.match(rpcMigration, /insert into public\.guest_chat_messages/i);
  assert.match(rpcMigration, /insert into public\.guest_chat_attachments/i);
  assert.match(rpcMigration, /message_id = v_message\.id/i);
});

test('pending state model: unused / consumed / abandoned', () => {
  assert.equal(isPendingUploadUnused({ consumed_at: null }), true);
  assert.equal(
    isPendingUploadConsumed({ consumed_at: '2026-01-01T00:00:00Z', message_id: 'msg-1' }),
    true,
  );
  assert.equal(
    isPendingUploadAbandoned({ consumed_at: '2026-01-01T00:00:00Z', message_id: null }),
    true,
  );
});

test('orphan image-only message detectable without touching text messages', () => {
  assert.equal(isOrphanImageOnlyMessage({ sender: 'guest', original: '', attachmentCount: 0 }), true);
  assert.equal(isOrphanImageOnlyMessage({ sender: 'guest', original: 'hello', attachmentCount: 0 }), false);
  assert.equal(isOrphanImageOnlyMessage({ sender: 'guest', original: '', attachmentCount: 2 }), false);
  assert.match(ORPHAN_IMAGE_ONLY_MESSAGES_SQL, /original_text = ''/);
  assert.match(ORPHAN_IMAGE_ONLY_MESSAGES_SQL, /a\.id is null/);
});

test('abandoned pending uploads SQL documents recovery path', () => {
  assert.match(ABANDONED_PENDING_UPLOADS_SQL, /consumed_at is not null/);
  assert.match(ABANDONED_PENDING_UPLOADS_SQL, /message_id is null/);
});

test('RPC error mapping', () => {
  assert.equal(parseGuestAttachmentRpcError({ message: 'ALREADY_USED' }), 'ALREADY_USED');
  assert.equal(parseGuestAttachmentRpcError({ message: 'EXPIRED token' }), 'EXPIRED');
  assert.equal(parseGuestAttachmentRpcError({ message: 'other' }), null);
});

test('legacy text-only path still uses appendMessage not RPC', () => {
  const fn = storeSrc.slice(storeSrc.indexOf('export async function appendMessage'));
  assert.doesNotMatch(fn.slice(0, 800), /create_guest_message_with_attachments/);
  const attachFn = storeSrc.slice(storeSrc.indexOf('export async function appendGuestMessageWithAttachments'));
  assert.match(attachFn.slice(0, 600), /create_guest_message_with_attachments/);
});

test('multi-image partial insert: RPC loops all tokens in one function body', () => {
  const body = rpcMigration.slice(
    rpcMigration.indexOf('for v_idx in 1 .. v_token_count loop'),
    rpcMigration.lastIndexOf('return jsonb_build_object'),
  );
  assert.match(body, /insert into public\.guest_chat_attachments/);
  // No commit between attachment inserts — single plpgsql function = one transaction.
  assert.doesNotMatch(body, /\bcommit\b/i);
});
