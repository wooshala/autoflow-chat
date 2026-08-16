// Phase 1H.11 + GC-Notification — buildChannelSummaries folds open sessions + messages into
// per-channel latest / latest-guest / unanswered_count. Run:
//   node --import tsx --test lib/guest-spike/__tests__/guestChannelSummary.spec.ts

import { describe, it, test } from 'node:test';
import assert from 'node:assert/strict';

import { buildChannelSummaries, computeUnansweredForSession } from '../guestChannelSummary.ts';
import { UNANSWERED_STALE_MS, formatUnansweredBadgeCount, isUnansweredStale } from '../unansweredBadge.ts';

const S = (id: string, channel_key: string, language_code: string | null = null) => ({
  id,
  channel_key,
  language_code,
  language_source: language_code ? 'user_selected' : null,
});
const M = (id: string, session_id: string, sender: string, created_at: string) => ({
  id,
  session_id,
  sender,
  created_at,
});

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
  assert.equal(s.unanswered_count, 0);
  assert.equal(s.first_unanswered_at, null);
});

test('open session with no messages → all latest_* null, language still from session', () => {
  const [s] = buildChannelSummaries([S('sess-2', 'room-308', 'ja')], []);
  assert.equal(s.language_code, 'ja');
  assert.equal(s.latest_message_id, null);
  assert.equal(s.latest_message_at, null);
  assert.equal(s.latest_sender_type, null);
  assert.equal(s.latest_guest_message_at, null);
  assert.equal(s.unanswered_count, 0);
  assert.equal(s.first_unanswered_at, null);
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
  assert.equal(s.unanswered_count, 1);
  assert.equal(s.first_unanswered_at, '2026-07-21T05:00:00.000Z');
});

test('empty input → empty summary', () => {
  assert.deepEqual(buildChannelSummaries([], []), []);
});

describe('unanswered_count (ledger-identical)', () => {
  it('guest 1, no staff → 1', () => {
    const u = computeUnansweredForSession([M('g1', 's', 'guest', '2026-08-01T10:00:00.000Z')]);
    assert.equal(u.unanswered_count, 1);
    assert.equal(u.first_unanswered_at, '2026-08-01T10:00:00.000Z');
  });

  it('guest 2, no staff → 2', () => {
    const u = computeUnansweredForSession([
      M('g1', 's', 'guest', '2026-08-01T10:00:00.000Z'),
      M('g2', 's', 'guest', '2026-08-01T10:01:00.000Z'),
    ]);
    assert.equal(u.unanswered_count, 2);
    assert.equal(u.first_unanswered_at, '2026-08-01T10:00:00.000Z');
  });

  it('guest → staff → guest×2 → 2', () => {
    const u = computeUnansweredForSession([
      M('g1', 's', 'guest', '2026-08-01T10:00:00.000Z'),
      M('st', 's', 'staff', '2026-08-01T10:05:00.000Z'),
      M('g2', 's', 'guest', '2026-08-01T10:10:00.000Z'),
      M('g3', 's', 'guest', '2026-08-01T10:11:00.000Z'),
    ]);
    assert.equal(u.unanswered_count, 2);
    assert.equal(u.first_unanswered_at, '2026-08-01T10:10:00.000Z');
  });

  it('guest → staff → badge none', () => {
    const [s] = buildChannelSummaries(
      [S('s', 'room-201')],
      [
        M('g1', 's', 'guest', '2026-08-01T10:00:00.000Z'),
        M('st', 's', 'staff', '2026-08-01T10:05:00.000Z'),
      ],
    );
    assert.equal(s.unanswered_count, 0);
    assert.equal(s.first_unanswered_at, null);
  });

  it('closed session messages do not contribute when session not open', () => {
    const rows = buildChannelSummaries([], [M('g1', 'closed', 'guest', '2026-08-01T10:00:00.000Z')]);
    assert.deepEqual(rows, []);
  });

  it('equal timestamps: staff wins (answered)', () => {
    const u = computeUnansweredForSession([
      M('g1', 's', 'guest', '2026-08-01T10:00:00.000Z'),
      M('st', 's', 'staff', '2026-08-01T10:00:00.000Z'),
    ]);
    assert.equal(u.unanswered_count, 0);
  });

  it('deleted latest guest falls back to prior alive unanswered', () => {
    const [s] = buildChannelSummaries(
      [S('s', 'room-201')],
      [
        M('g1', 's', 'guest', '2026-08-01T10:00:00.000Z'),
        { ...M('g2', 's', 'guest', '2026-08-01T10:10:00.000Z'), is_deleted: true },
      ],
    );
    assert.equal(s.latest_guest_message_at, '2026-08-01T10:00:00.000Z');
    assert.equal(s.unanswered_count, 1);
    assert.equal(s.first_unanswered_at, '2026-08-01T10:00:00.000Z');
  });

  it('deleted-only guest clears unanswered_count', () => {
    const u = computeUnansweredForSession([
      { ...M('g1', 's', 'guest', '2026-08-01T10:00:00.000Z'), is_deleted: true },
    ]);
    assert.equal(u.unanswered_count, 0);
    assert.equal(u.first_unanswered_at, null);
  });
});

describe('badge format + stale', () => {
  it('1–99 / 99+ / 0 hidden', () => {
    assert.equal(formatUnansweredBadgeCount(0), '');
    assert.equal(formatUnansweredBadgeCount(1), '1');
    assert.equal(formatUnansweredBadgeCount(12), '12');
    assert.equal(formatUnansweredBadgeCount(100), '99+');
  });

  it('exactly 24h → stale; under → not', () => {
    const now = Date.parse('2026-08-02T12:00:00.000Z');
    assert.equal(isUnansweredStale(new Date(now - UNANSWERED_STALE_MS).toISOString(), now), true);
    assert.equal(isUnansweredStale(new Date(now - UNANSWERED_STALE_MS + 1).toISOString(), now), false);
  });

  it('missing firstUnansweredAt is not stale', () => {
    assert.equal(isUnansweredStale('', Date.now()), false);
  });
});
