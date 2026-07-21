// Phase 1H.9 — the room→channel mapping is now a PURE rule (cust-<no> → room-<no>), not a
// per-room table. These tests pin the rule and its boundaries (the 201 miss was exactly a
// missing mapping / room-list entry).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { lookupChannelKey } from '../channels.ts';

test('a customer room resolves to its guest channel by the general rule', () => {
  assert.equal(lookupChannelKey('cust-201'), 'room-201');
  assert.equal(lookupChannelKey('cust-308'), 'room-308'); // 308 keeps working with no special entry
  assert.equal(lookupChannelKey('cust-701'), 'room-701');
});

test('4-digit room numbers are supported', () => {
  assert.equal(lookupChannelKey('cust-1001'), 'room-1001');
});

test('non-customer / malformed ids → null (never coerced to a channel)', () => {
  assert.equal(lookupChannelKey('staff-global'), null);
  assert.equal(lookupChannelKey('operations'), null);
  assert.equal(lookupChannelKey('staff-cleaning'), null);
  assert.equal(lookupChannelKey('cust-abc'), null); // non-numeric
  assert.equal(lookupChannelKey('cust-'), null); // no number
  assert.equal(lookupChannelKey('cust-12'), null); // too short (need 3-4 digits)
  assert.equal(lookupChannelKey('room-201'), null); // already a channel key, not a room id
  assert.equal(lookupChannelKey(''), null);
});
