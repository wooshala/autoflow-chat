// Phase 1I.1-B (option 2) — pure Customer Information helper. Only room-no derivation remains;
// phone masking / match-status / confidence helpers were removed with the derived reservation.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { roomNoFromChannelKey } from '../customerContextView.ts';

test('roomNoFromChannelKey: room-<no> → <no>, else null', () => {
  assert.equal(roomNoFromChannelKey('room-201'), '201');
  assert.equal(roomNoFromChannelKey('room-1001'), '1001');
  assert.equal(roomNoFromChannelKey('cust-201'), null); // room id, not channel key
  assert.equal(roomNoFromChannelKey('room-abc'), null);
  assert.equal(roomNoFromChannelKey(''), null);
});
