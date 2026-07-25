// Phase 1H.7 — session claim state machine. Run: node --test lib/guest-spike/__tests__/sessionPolicy.spec.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { decideSessionOutcome } from '../sessionPolicy.ts';

test('open cookie + same channel → reconnect (active irrelevant)', () => {
  assert.deepEqual(
    decideSessionOutcome({ cookieSession: { channelMatches: true, status: 'open' }, hasActiveSession: true }),
    { kind: 'reconnect' },
  );
  assert.deepEqual(
    decideSessionOutcome({ cookieSession: { channelMatches: true, status: 'open' }, hasActiveSession: false }),
    { kind: 'reconnect' },
  );
});

test('closed cookie + no active session → create (QR re-entry)', () => {
  assert.deepEqual(
    decideSessionOutcome({ cookieSession: { channelMatches: true, status: 'closed' }, hasActiveSession: false }),
    { kind: 'create' },
  );
});

test('closed cookie + active session → occupied (never join the other guest)', () => {
  assert.deepEqual(
    decideSessionOutcome({ cookieSession: { channelMatches: true, status: 'closed' }, hasActiveSession: true }),
    { kind: 'occupied' },
  );
});

test('no cookie + no active → create', () => {
  assert.deepEqual(decideSessionOutcome({ cookieSession: null, hasActiveSession: false }), { kind: 'create' });
});

test('no cookie + active → occupied (NEVER auto-join)', () => {
  assert.deepEqual(decideSessionOutcome({ cookieSession: null, hasActiveSession: true }), { kind: 'occupied' });
});

test('invalid/other-channel cookie + no active → create', () => {
  assert.deepEqual(
    decideSessionOutcome({ cookieSession: { channelMatches: false, status: 'open' }, hasActiveSession: false }),
    { kind: 'create' },
  );
  assert.deepEqual(
    decideSessionOutcome({ cookieSession: { channelMatches: false, status: 'closed' }, hasActiveSession: false }),
    { kind: 'create' },
  );
});

test('invalid/other-channel cookie + active → occupied', () => {
  assert.deepEqual(
    decideSessionOutcome({ cookieSession: { channelMatches: false, status: 'open' }, hasActiveSession: true }),
    { kind: 'occupied' },
  );
  assert.deepEqual(
    decideSessionOutcome({ cookieSession: { channelMatches: false, status: 'closed' }, hasActiveSession: true }),
    { kind: 'occupied' },
  );
});
