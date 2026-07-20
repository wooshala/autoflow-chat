// Phase 1H.7 — session claim state machine. Run: node --test lib/guest-spike/__tests__/sessionPolicy.spec.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { decideSessionOutcome } from '../sessionPolicy.ts';

test('valid cookie, this channel, open → reconnect', () => {
  assert.deepEqual(decideSessionOutcome({ cookieSession: { channelMatches: true, status: 'open' }, hasActiveSession: true }), { kind: 'reconnect' });
});
test('valid cookie, this channel, closed → closed (no new session)', () => {
  assert.deepEqual(decideSessionOutcome({ cookieSession: { channelMatches: true, status: 'closed' }, hasActiveSession: false }), { kind: 'closed' });
  // even if a new active exists elsewhere, the closed-cookie holder stays closed
  assert.deepEqual(decideSessionOutcome({ cookieSession: { channelMatches: true, status: 'closed' }, hasActiveSession: true }), { kind: 'closed' });
});
test('no cookie, no active → create + claim', () => {
  assert.deepEqual(decideSessionOutcome({ cookieSession: null, hasActiveSession: false }), { kind: 'create' });
});
test('no cookie, active exists → occupied (NEVER auto-join)', () => {
  assert.deepEqual(decideSessionOutcome({ cookieSession: null, hasActiveSession: true }), { kind: 'occupied' });
});
test('cookie for a DIFFERENT channel → treated as no cookie; active exists → occupied', () => {
  assert.deepEqual(decideSessionOutcome({ cookieSession: { channelMatches: false, status: 'open' }, hasActiveSession: true }), { kind: 'occupied' });
});
test('cookie for a different channel, no active here → create', () => {
  assert.deepEqual(decideSessionOutcome({ cookieSession: { channelMatches: false, status: 'open' }, hasActiveSession: false }), { kind: 'create' });
});
