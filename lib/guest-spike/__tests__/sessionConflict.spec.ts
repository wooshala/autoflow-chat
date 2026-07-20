// Phase 1H.7 — the concurrent-create race → occupied conversion. This is the store/route-level
// logic that turns a DB one-open-per-channel unique violation into 'occupied' (NOT a 500, and
// NOT a silent join to the existing session). Pure so it runs under `node --test`.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isOneOpenConflict } from '../sessionConflict.ts';

test('23505 on the open-session index → conflict (occupied)', () => {
  assert.equal(
    isOneOpenConflict({
      code: '23505',
      message: 'duplicate key value violates unique constraint "guest_chat_sessions_one_open_per_channel"',
      details: 'Key (channel_key)=(room-308) already exists.',
    }),
    true,
  );
});

test('23505 with no index name still → conflict (open index is the only realistic cause)', () => {
  assert.equal(isOneOpenConflict({ code: '23505' }), true);
  assert.equal(isOneOpenConflict({ code: '23505', message: 'duplicate key value' }), true);
});

test('23505 naming the pkey → NOT a claim race (real fault, must not be swallowed)', () => {
  assert.equal(
    isOneOpenConflict({
      code: '23505',
      message: 'duplicate key value violates unique constraint "guest_chat_sessions_pkey"',
    }),
    false,
  );
});

test('a non-unique DB error is NOT swallowed as occupied', () => {
  assert.equal(isOneOpenConflict({ code: '23503', message: 'foreign key violation' }), false);
  assert.equal(isOneOpenConflict({ code: '42P01', message: 'relation does not exist' }), false);
  assert.equal(isOneOpenConflict({ message: 'network error' }), false);
});

test('null / undefined error → false', () => {
  assert.equal(isOneOpenConflict(null), false);
  assert.equal(isOneOpenConflict(undefined), false);
});
