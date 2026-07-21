// Phase 1H.7 (language-on-session fix) — the guest entry screen is decided from the SESSION's
// own language, never a channel value. A fresh session (language_code = NULL) ALWAYS shows the
// selection screen, so a previous guest's language can never skip it for the next guest.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { decideGuestEntryPhase } from '../sessionPolicy.ts';

test('fresh session (open, language NULL) → selecting (no inheritance)', () => {
  assert.equal(decideGuestEntryPhase({ status: 'open', languageCode: null }), 'selecting');
});

test('reconnect: open session that already has a valid language → chatting', () => {
  assert.equal(decideGuestEntryPhase({ status: 'open', languageCode: 'en' }), 'chatting');
  assert.equal(decideGuestEntryPhase({ status: 'open', languageCode: 'zh-CN' }), 'chatting');
});

test('open session with an unsupported/garbage language → selecting (defensive)', () => {
  assert.equal(decideGuestEntryPhase({ status: 'open', languageCode: 'xx' }), 'selecting');
  assert.equal(decideGuestEntryPhase({ status: 'open', languageCode: '' }), 'selecting');
});

test('closed session → closed screen', () => {
  assert.equal(decideGuestEntryPhase({ status: 'closed', languageCode: null }), 'closed');
  // even if a closed row somehow still carried a language, it must NOT enter chat.
  assert.equal(decideGuestEntryPhase({ status: 'closed', languageCode: 'zh-CN' }), 'closed');
});

test('occupied → occupied screen', () => {
  assert.equal(decideGuestEntryPhase({ status: 'occupied', languageCode: null }), 'occupied');
});

test('new guest B does not inherit previous guest A language: B session starts NULL → selecting', () => {
  // A had zh-CN, closed. B is a brand-new session: languageCode is NULL regardless of any
  // lingering channel value, so B is sent to the selection screen.
  const bEntry = decideGuestEntryPhase({ status: 'open', languageCode: null });
  assert.equal(bEntry, 'selecting');
});
