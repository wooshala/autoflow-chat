// Phase 2D — buildUnansweredSummary folds open sessions + messages into the ledger banner feed.
// A staff reply being newest must clear the room; a guest message after it must bring it back.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildUnansweredSummary } from '../unansweredSummary.ts';
import { roomNumberFromChannelKey, isRealRoomChannel } from '../roomAllowlist.ts';

const AT = '2026-08-02T00:00:00.000Z';
const S = (id: string, channel_key: string, started_at = '2026-08-01T00:00:00.000Z') => ({
  id,
  channel_key,
  started_at,
});
const M = (
  id: string,
  session_id: string | null,
  sender: string,
  created_at: string,
  original_text?: string,
  translated_json?: Record<string, string>,
) => ({
  id,
  session_id,
  sender,
  created_at,
  original_text: original_text ?? null,
  translated_json: translated_json ?? null,
});

// ── 6. open session + guest only → 포함 ────────────────────────────────
test('guest with no staff reply is unanswered', () => {
  const r = buildUnansweredSummary(
    [S('s1', 'room-802')],
    [M('m1', 's1', 'guest', '2026-08-01T10:00:00.000Z')],
    AT,
  );
  assert.equal(r.totalRooms, 1);
  assert.equal(r.rooms[0]!.roomNumber, '802');
  assert.equal(r.rooms[0]!.guestMessageCount, 1);
  assert.equal(r.rooms[0]!.latestStaffMessageAt, null);
  assert.equal(r.rooms[0]!.unanswered, true);
});

// ── 7. guest 후 staff → 제외 ──────────────────────────────────────────
test('staff reply after the guest clears the room', () => {
  const r = buildUnansweredSummary(
    [S('s1', 'room-802')],
    [
      M('m1', 's1', 'guest', '2026-08-01T10:00:00.000Z'),
      M('m2', 's1', 'staff', '2026-08-01T10:05:00.000Z'),
    ],
    AT,
  );
  assert.equal(r.totalRooms, 0);
});

// ── 8. staff 후 guest → 포함 ──────────────────────────────────────────
test('guest message after a staff reply is unanswered again', () => {
  const r = buildUnansweredSummary(
    [S('s1', 'room-802')],
    [
      M('m1', 's1', 'guest', '2026-08-01T10:00:00.000Z'),
      M('m2', 's1', 'staff', '2026-08-01T10:05:00.000Z'),
      M('m3', 's1', 'guest', '2026-08-01T10:09:00.000Z'),
    ],
    AT,
  );
  assert.equal(r.totalRooms, 1);
  assert.equal(r.rooms[0]!.guestMessageCount, 1);
  assert.equal(r.rooms[0]!.firstUnansweredAt, '2026-08-01T10:09:00.000Z');
  assert.equal(r.rooms[0]!.latestStaffMessageAt, '2026-08-01T10:05:00.000Z');
});

// ── 9. 연속 guest → count 정확 (지시서 7장 예시) ──────────────────────
test('counts only the guest messages after the last staff reply', () => {
  const r = buildUnansweredSummary(
    [S('s1', 'room-802')],
    [
      M('a', 's1', 'guest', '2026-08-01T10:00:00.000Z'),
      M('b', 's1', 'guest', '2026-08-01T10:01:00.000Z'),
      M('c', 's1', 'staff', '2026-08-01T10:02:00.000Z'),
      M('d', 's1', 'guest', '2026-08-01T10:03:00.000Z'),
      M('e', 's1', 'guest', '2026-08-01T10:04:00.000Z'),
    ],
    AT,
  );
  assert.equal(r.rooms[0]!.guestMessageCount, 2);
  assert.equal(r.rooms[0]!.firstUnansweredAt, '2026-08-01T10:03:00.000Z');
  assert.equal(r.rooms[0]!.latestGuestMessageAt, '2026-08-01T10:04:00.000Z');
  assert.equal(r.totalMessages, 2);
});

// ── 10. closed session → 제외 (호출부가 open 만 전달) ─────────────────
test('closed sessions never reach the feed', () => {
  const r = buildUnansweredSummary([], [M('m1', 's-closed', 'guest', '2026-07-20T10:00:00.000Z')], AT);
  assert.equal(r.totalRooms, 0);
});

// ── 11. session_id null legacy row → 제외 ─────────────────────────────
test('legacy messages without a session are ignored', () => {
  const r = buildUnansweredSummary(
    [S('s1', 'room-802')],
    [M('m1', null, 'guest', '2026-07-01T10:00:00.000Z')],
    AT,
  );
  assert.equal(r.totalRooms, 0);
});

// ── 12. 테스트 채널 → 제외 ────────────────────────────────────────────
test('test channels are excluded', () => {
  const r = buildUnansweredSummary(
    [S('s1', '308-live'), S('s2', '1h5-a'), S('s3', '1h5-pv-35411'), S('s4', 'room-999')],
    [
      M('m1', 's1', 'guest', '2026-08-01T10:00:00.000Z'),
      M('m2', 's2', 'guest', '2026-08-01T10:00:00.000Z'),
      M('m3', 's3', 'guest', '2026-08-01T10:00:00.000Z'),
      M('m4', 's4', 'guest', '2026-08-01T10:00:00.000Z'),
    ],
    AT,
  );
  assert.equal(r.totalRooms, 0);
});

// ── 13·14. allowlist / room 변환 ──────────────────────────────────────
test('room allowlist maps only real rooms', () => {
  assert.equal(roomNumberFromChannelKey('room-802'), '802');
  assert.equal(roomNumberFromChannelKey('room-201'), '201');
  assert.equal(roomNumberFromChannelKey('room-999'), null); // 형식은 맞으나 실재 객실 아님
  assert.equal(roomNumberFromChannelKey('room-204'), null); // 결번
  assert.equal(roomNumberFromChannelKey('308-live'), null);
  assert.equal(roomNumberFromChannelKey('1h5-degrade'), null);
  assert.equal(roomNumberFromChannelKey('room-test'), null);
  assert.equal(roomNumberFromChannelKey(null), null);
  assert.equal(roomNumberFromChannelKey(''), null);
  assert.equal(isRealRoomChannel('room-706'), true);
  assert.equal(isRealRoomChannel('test-706'), false);
});

// ── 15. 오래된 open session → 포함 (API 가 시간으로 숨기지 않음) ──────
test('a long-open session is still reported', () => {
  const r = buildUnansweredSummary(
    [S('s1', 'room-308', '2026-07-20T13:56:00.000Z')],
    [M('m1', 's1', 'guest', '2026-07-20T13:56:00.000Z')],
    AT,
  );
  assert.equal(r.totalRooms, 1);
  assert.equal(r.rooms[0]!.sessionStartedAt, '2026-07-20T13:56:00.000Z');
});

// ── 16. 빈 결과 계약 ──────────────────────────────────────────────────
test('empty result keeps the full shape', () => {
  const r = buildUnansweredSummary([], [], AT);
  assert.deepEqual(r, { rooms: [], totalRooms: 0, totalMessages: 0, generatedAt: AT });
});

// ── 정렬: 가장 오래 미응답이 먼저 ─────────────────────────────────────
test('sorted oldest-unanswered first, ties by room number', () => {
  const r = buildUnansweredSummary(
    [S('s1', 'room-802'), S('s2', 'room-306'), S('s3', 'room-201')],
    [
      M('m1', 's1', 'guest', '2026-08-01T12:00:00.000Z'),
      M('m2', 's2', 'guest', '2026-07-23T06:45:00.000Z'),
      M('m3', 's3', 'guest', '2026-07-23T06:45:00.000Z'), // s2 와 동시각 → 방번호 순
    ],
    AT,
  );
  assert.deepEqual(r.rooms.map((x) => x.roomNumber), ['201', '306', '802']);
});

// ── 동시각 guest/staff → 답변으로 간주(보수적) ────────────────────────
test('a staff reply at the same instant counts as answered', () => {
  const r = buildUnansweredSummary(
    [S('s1', 'room-802')],
    [
      M('m1', 's1', 'guest', '2026-08-01T10:00:00.000Z'),
      M('m2', 's1', 'staff', '2026-08-01T10:00:00.000Z'),
    ],
    AT,
  );
  assert.equal(r.totalRooms, 0);
});

test('latestGuestMessagePreview prefers KO and never exposes raw fields', () => {
  const r = buildUnansweredSummary(
    [S('s1', 'room-802')],
    [
      M('m1', 's1', 'guest', '2026-08-01T10:00:00.000Z', 'hello', { ko: '수건 주세요' }),
      M('m2', 's1', 'guest', '2026-08-01T10:01:00.000Z', 'water please', {
        ko: '생수도 부탁합니다',
      }),
    ],
    AT,
  );
  assert.equal(r.rooms[0]!.guestMessageCount, 2);
  assert.equal(r.rooms[0]!.latestGuestMessagePreview, '생수도 부탁합니다');
  assert.equal(
    Object.prototype.hasOwnProperty.call(r.rooms[0]!, 'original_text'),
    false,
  );
});

test('preview falls back to original when KO missing', () => {
  const r = buildUnansweredSummary(
    [S('s1', 'room-802')],
    [M('m1', 's1', 'guest', '2026-08-01T10:00:00.000Z', 'こんにちは')],
    AT,
  );
  assert.equal(r.rooms[0]!.latestGuestMessagePreview, 'こんにちは');
});

// ── 본문 미포함 계약 (preview 문자열만 허용) ──────────────────────────
test('no raw message body fields can appear in the feed', () => {
  const r = buildUnansweredSummary(
    [S('s1', 'room-802')],
    [M('m1', 's1', 'guest', '2026-08-01T10:00:00.000Z')],
    AT,
  );
  // The shape is closed: any new content-bearing field would have to be added here first.
  assert.deepEqual(Object.keys(r.rooms[0]!).sort(), [
    'channelKey',
    'conversationId',
    'firstUnansweredAt',
    'guestMessageCount',
    'latestGuestMessageAt',
    'latestGuestMessagePreview',
    'latestStaffMessageAt',
    'roomNumber',
    'sessionStartedAt',
    'sessionStatus',
    'unanswered',
  ]);
  for (const banned of ['text', 'body', 'original', 'translated']) {
    assert.equal(
      Object.keys(r.rooms[0]!).some((k) => k.toLowerCase().includes(banned)),
      false,
      `field name must not contain "${banned}"`,
    );
  }
  assert.equal(typeof r.rooms[0]!.latestGuestMessagePreview, 'string');
  assert.ok(r.rooms[0]!.latestGuestMessagePreview.length > 0);
});

// ── guest 없는 open session → 제외 ────────────────────────────────────
test('an open session with only staff messages is not unanswered', () => {
  const r = buildUnansweredSummary(
    [S('s1', 'room-802')],
    [M('m1', 's1', 'staff', '2026-08-01T10:00:00.000Z')],
    AT,
  );
  assert.equal(r.totalRooms, 0);
});

// ── soft-delete: exclude deleted from unanswered + alive fallback ─────
test('deleted latest guest falls back to prior alive unanswered guest', () => {
  const r = buildUnansweredSummary(
    [S('s1', 'room-802')],
    [
      M('m1', 's1', 'guest', '2026-08-01T10:00:00.000Z', 'first', { ko: '첫번째' }),
      { ...M('m2', 's1', 'guest', '2026-08-01T10:10:00.000Z', 'second', { ko: '두번째' }), is_deleted: true },
    ],
    AT,
  );
  assert.equal(r.totalRooms, 1);
  assert.equal(r.rooms[0]!.guestMessageCount, 1);
  assert.equal(r.rooms[0]!.latestGuestMessageAt, '2026-08-01T10:00:00.000Z');
  assert.equal(r.rooms[0]!.latestGuestMessagePreview, '첫번째');
  assert.equal(r.rooms[0]!.firstUnansweredAt, '2026-08-01T10:00:00.000Z');
});

test('deleted-only guest messages clear unanswered', () => {
  const r = buildUnansweredSummary(
    [S('s1', 'room-802')],
    [{ ...M('m1', 's1', 'guest', '2026-08-01T10:00:00.000Z'), is_deleted: true }],
    AT,
  );
  assert.equal(r.totalRooms, 0);
  assert.equal(r.totalMessages, 0);
});

test('deleted staff does not count as a reply (guest stays unanswered)', () => {
  const r = buildUnansweredSummary(
    [S('s1', 'room-802')],
    [
      M('m1', 's1', 'guest', '2026-08-01T10:00:00.000Z'),
      { ...M('m2', 's1', 'staff', '2026-08-01T10:05:00.000Z'), is_deleted: true },
    ],
    AT,
  );
  assert.equal(r.totalRooms, 1);
  assert.equal(r.rooms[0]!.latestStaffMessageAt, null);
  assert.equal(r.rooms[0]!.guestMessageCount, 1);
});
