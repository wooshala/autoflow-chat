// Phase 1H.11 — buildChannelSummaries folds open sessions + their messages into per-channel
// latest / latest-guest info. Only open sessions are summarized; a staff reply being newest must
// NOT hide an earlier unread guest message.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildChannelSummaries } from '../guestChannelSummary.ts';

const S = (id: string, channel_key: string, language_code: string | null = null) => ({
  id,
  channel_key,
  language_code,
  language_source: language_code ? 'user_selected' : null,
});
const M = (id: string, session_id: string, sender: string, created_at: string) => ({ id, session_id, sender, created_at });

test('latest + latest-guest computed within the open session', () => {
  const [s] = buildChannelSummaries(
    [S('sess-1', 'room-201', 'ko')],
    [
      M('m1', 'sess-1', 'guest', '2026-07-21T05:00:00.000Z'),
      M('m2', 'sess-1', 'staff', '2026-07-21T05:01:00.000Z'), // staff reply is newest overall
    ],
  );
  assert.equal(s.channel_key, 'room-201');
  assert.equal(s.session_status, 'open');
  assert.equal(s.language_code, 'ko');
  assert.equal(s.latest_message_id, 'm2');
  assert.equal(s.latest_sender_type, 'staff');
  assert.equal(s.latest_message_at, '2026-07-21T05:01:00.000Z');
  // unread must key off the guest message, not the newest (staff) message
  assert.equal(s.latest_guest_message_at, '2026-07-21T05:00:00.000Z');
});

test('open session with no messages → all latest_* null, language still from session', () => {
  const [s] = buildChannelSummaries([S('sess-2', 'room-308', 'ja')], []);
  assert.equal(s.language_code, 'ja');
  assert.equal(s.latest_message_id, null);
  assert.equal(s.latest_message_at, null);
  assert.equal(s.latest_sender_type, null);
  assert.equal(s.latest_guest_message_at, null);
});

test('messages of sessions NOT in the open set are ignored (closed history never leaks)', () => {
  const [s] = buildChannelSummaries(
    [S('open-1', 'room-201')],
    [
      M('old', 'closed-9', 'guest', '2026-07-20T00:00:00.000Z'), // belongs to a closed session
      M('new', 'open-1', 'guest', '2026-07-21T05:00:00.000Z'),
    ],
  );
  assert.equal(s.latest_guest_message_at, '2026-07-21T05:00:00.000Z');
  assert.equal(s.latest_message_id, 'new');
});

test('empty input → empty summary', () => {
  assert.deepEqual(buildChannelSummaries([], []), []);
});
