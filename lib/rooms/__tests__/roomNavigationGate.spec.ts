// Phase 1E.1 — runtime override gate tests.
// Run: node --test lib/rooms/__tests__/roomNavigationGate.spec.ts

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseRoomNavigationOverride,
  resolveRoomNavigationEnabled,
} from '../roomNavigationFlags.ts';

test('parseRoomNavigationOverride: only exact on/off, else null', () => {
  assert.equal(parseRoomNavigationOverride('on'), 'on');
  assert.equal(parseRoomNavigationOverride('off'), 'off');
  assert.equal(parseRoomNavigationOverride(null), null);
  assert.equal(parseRoomNavigationOverride(undefined), null);
  assert.equal(parseRoomNavigationOverride(''), null);
  assert.equal(parseRoomNavigationOverride('ON'), null, 'case-sensitive');
  assert.equal(parseRoomNavigationOverride('1'), null);
  assert.equal(parseRoomNavigationOverride('true'), null);
});

const gate = (showOpsConsole: boolean, buildEnabled: boolean, override: 'on' | 'off' | null) =>
  resolveRoomNavigationEnabled({ showOpsConsole, buildEnabled, override });

test('ops console off → always false (fail-safe), even override=on', () => {
  assert.equal(gate(false, true, 'on'), false);
  assert.equal(gate(false, false, 'on'), false);
});

test('override null → follows build flag', () => {
  assert.equal(gate(true, false, null), false);
  assert.equal(gate(true, true, null), true);
});

test('override=on → forces enabled even when build flag is 0', () => {
  assert.equal(gate(true, false, 'on'), true);
  assert.equal(gate(true, true, 'on'), true);
});

test('override=off → forces disabled even when build flag is 1', () => {
  assert.equal(gate(true, true, 'off'), false);
  assert.equal(gate(true, false, 'off'), false);
});

test('invalid stored value is treated as null (follows build flag)', () => {
  const override = parseRoomNavigationOverride('garbage'); // → null
  assert.equal(gate(true, true, override), true);
  assert.equal(gate(true, false, override), false);
});
