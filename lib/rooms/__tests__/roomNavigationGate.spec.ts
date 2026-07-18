// Phase 1E.1/1F.1 — runtime override gate tests (ops-console dependency removed).
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
});

const gate = (buildEnabled: boolean, runtimeOverride: 'on' | 'off' | null) =>
  resolveRoomNavigationEnabled({ buildEnabled, runtimeOverride });

test('override null → follows the build flag', () => {
  assert.equal(gate(false, null), false);
  assert.equal(gate(true, null), true);
});

test("override 'on' → forces enabled regardless of build flag (no ops-console dependency)", () => {
  assert.equal(gate(false, 'on'), true);
  assert.equal(gate(true, 'on'), true);
});

test("override 'off' → forces disabled regardless of build flag", () => {
  assert.equal(gate(true, 'off'), false);
  assert.equal(gate(false, 'off'), false);
});

test('invalid stored value is treated as null (follows build flag)', () => {
  const override = parseRoomNavigationOverride('garbage'); // → null
  assert.equal(gate(true, override), true);
  assert.equal(gate(false, override), false);
});
