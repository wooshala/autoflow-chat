import test from 'node:test';
import assert from 'node:assert/strict';

import { decideGuestMessageDelete } from '../guestMessageDelete.ts';

const base = {
  id: 'm1',
  channel_key: 'room-201',
  session_id: 'sess-1',
  sender: 'guest' as const,
  is_deleted: false,
  staff_user_id: null as string | null,
};

test('guest can delete own guest message in own session', () => {
  const d = decideGuestMessageDelete({
    message: base,
    channelKey: 'room-201',
    actor: { kind: 'guest', sessionId: 'sess-1' },
  });
  assert.deepEqual(d, { ok: true, reason: 'owner', alreadyDeleted: false });
});

test('guest cannot delete staff message', () => {
  const d = decideGuestMessageDelete({
    message: { ...base, sender: 'staff', staff_user_id: 'u-staff' },
    channelKey: 'room-201',
    actor: { kind: 'guest', sessionId: 'sess-1' },
  });
  assert.equal(d.ok, false);
  if (!d.ok) assert.equal(d.error, 'FORBIDDEN');
});

test('guest cannot delete other session message', () => {
  const d = decideGuestMessageDelete({
    message: base,
    channelKey: 'room-201',
    actor: { kind: 'guest', sessionId: 'sess-OTHER' },
  });
  assert.equal(d.ok, false);
  if (!d.ok) assert.equal(d.error, 'FORBIDDEN');
});

test('channel mismatch → CHANNEL_MISMATCH', () => {
  const d = decideGuestMessageDelete({
    message: base,
    channelKey: 'room-999',
    actor: { kind: 'guest', sessionId: 'sess-1' },
  });
  assert.equal(d.ok, false);
  if (!d.ok) assert.equal(d.error, 'CHANNEL_MISMATCH');
});

test('staff can delete own staff message', () => {
  const d = decideGuestMessageDelete({
    message: { ...base, sender: 'staff', staff_user_id: 'u1' },
    channelKey: 'room-201',
    actor: { kind: 'staff', userId: 'u1', role: 'front' },
  });
  assert.deepEqual(d, { ok: true, reason: 'owner', alreadyDeleted: false });
});

test('staff cannot delete other staff message', () => {
  const d = decideGuestMessageDelete({
    message: { ...base, sender: 'staff', staff_user_id: 'u1' },
    channelKey: 'room-201',
    actor: { kind: 'staff', userId: 'u2', role: 'front' },
  });
  assert.equal(d.ok, false);
});

test('staff cannot delete legacy staff message without staff_user_id', () => {
  const d = decideGuestMessageDelete({
    message: { ...base, sender: 'staff', staff_user_id: null },
    channelKey: 'room-201',
    actor: { kind: 'staff', userId: 'u1', role: 'front' },
  });
  assert.equal(d.ok, false);
});

test('admin can delete any message', () => {
  const d = decideGuestMessageDelete({
    message: base,
    channelKey: 'room-201',
    actor: { kind: 'staff', userId: 'admin1', role: 'manager' },
  });
  assert.deepEqual(d, { ok: true, reason: 'admin', alreadyDeleted: false });
});

test('already deleted → idempotent success', () => {
  const d = decideGuestMessageDelete({
    message: { ...base, is_deleted: true },
    channelKey: 'room-201',
    actor: { kind: 'guest', sessionId: 'sess-1' },
  });
  assert.deepEqual(d, { ok: true, reason: 'owner', alreadyDeleted: true });
});

test('missing message → NOT_FOUND', () => {
  const d = decideGuestMessageDelete({
    message: null,
    channelKey: 'room-201',
    actor: { kind: 'guest', sessionId: 'sess-1' },
  });
  assert.equal(d.ok, false);
  if (!d.ok) assert.equal(d.error, 'NOT_FOUND');
});
