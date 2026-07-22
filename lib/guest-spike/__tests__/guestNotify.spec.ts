import assert from 'node:assert/strict';
import { test } from 'node:test';

import { shouldNotifyGuestMessage } from '../guestNotify';
import { buildChannelSummaries } from '../guestChannelSummary';

const base = { latestId: 'm1', isNew: true, seeded: true };

test('shouldNotifyGuestMessage: fires for a new, unseen guest message', () => {
  assert.equal(shouldNotifyGuestMessage(base), true);
});

test('shouldNotifyGuestMessage: fires for a new message even while staff views that room (suppression removed)', () => {
  // isViewing no longer exists — a new guest message always sounds. Same input as `base`.
  assert.equal(shouldNotifyGuestMessage({ latestId: 'm2', isNew: true, seeded: true }), true);
});

test('shouldNotifyGuestMessage: not seeded → never fires (behavior 2: first load)', () => {
  assert.equal(shouldNotifyGuestMessage({ ...base, seeded: false }), false);
});

test('shouldNotifyGuestMessage: same id (not new) → no duplicate (behavior 3)', () => {
  assert.equal(shouldNotifyGuestMessage({ ...base, isNew: false }), false);
});

test('shouldNotifyGuestMessage: no latest id → nothing to notify', () => {
  assert.equal(shouldNotifyGuestMessage({ ...base, latestId: null }), false);
});

test('buildChannelSummaries: latest_guest_message_id/preview reflect the newest GUEST message only', () => {
  const sessions = [{ id: 's1', channel_key: 'room-608', language_code: 'en', language_source: 'user_selected' }];
  const messages = [
    { id: 'g1', session_id: 's1', sender: 'guest', created_at: '2026-07-22T00:00:01Z', original_text: 'hi', translated_json: { ko: '안녕하세요' } },
    { id: 'g2', session_id: 's1', sender: 'guest', created_at: '2026-07-22T00:00:03Z', original_text: 'towel please', translated_json: { ko: '수건 주세요' } },
    // A LATER staff message must not become the guest preview / id.
    { id: 't1', session_id: 's1', sender: 'staff', created_at: '2026-07-22T00:00:05Z', original_text: '네 갈게요', translated_json: null },
  ];
  const [sum] = buildChannelSummaries(sessions, messages);
  assert.equal(sum.latest_guest_message_id, 'g2');
  // Korean translation is preferred over the original for the staff-facing preview.
  assert.equal(sum.latest_guest_message_preview, '수건 주세요');
});

test('buildChannelSummaries: preview falls back to original_text when no Korean translation', () => {
  const sessions = [{ id: 's2', channel_key: 'room-609', language_code: 'ja', language_source: 'user_selected' }];
  const messages = [
    { id: 'g9', session_id: 's2', sender: 'guest', created_at: '2026-07-22T00:00:01Z', original_text: 'こんにちは', translated_json: {} },
  ];
  const [sum] = buildChannelSummaries(sessions, messages);
  assert.equal(sum.latest_guest_message_id, 'g9');
  assert.equal(sum.latest_guest_message_preview, 'こんにちは');
});

test('buildChannelSummaries: no guest message → guest id/preview null (staff-only session)', () => {
  const sessions = [{ id: 's3', channel_key: 'room-610', language_code: null, language_source: null }];
  const messages = [
    { id: 't9', session_id: 's3', sender: 'staff', created_at: '2026-07-22T00:00:01Z', original_text: 'hello', translated_json: null },
  ];
  const [sum] = buildChannelSummaries(sessions, messages);
  assert.equal(sum.latest_guest_message_id, null);
  assert.equal(sum.latest_guest_message_preview, null);
});
