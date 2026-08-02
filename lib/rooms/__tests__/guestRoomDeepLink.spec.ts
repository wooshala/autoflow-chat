// Phase 4A — /chat?guestRoom= deep link parse. Run:
//   node --experimental-strip-types --import ./lib/guest-spike/__tests__/tsResolve.mjs \
//     --test lib/rooms/__tests__/guestRoomDeepLink.spec.ts
// (tsResolve needed: guestRoomDeepLink → extensionless roomAllowlist for Next.js.)

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  customerRoomIdFromGuestRoom,
  guestRoomFromSearchParams,
  parseGuestRoomQuery,
} from '../guestRoomDeepLink.ts';
import { HOTEL_ROOM_NUMBERS } from '../../guest-spike/roomAllowlist.ts';

test('accepts allowlisted 39 rooms only', () => {
  assert.equal(HOTEL_ROOM_NUMBERS.length, 39);
  for (const r of HOTEL_ROOM_NUMBERS) {
    assert.equal(parseGuestRoomQuery(r), r);
    assert.equal(customerRoomIdFromGuestRoom(r), `cust-${r}`);
  }
});

test('rejects missing rooms, test channels, and wrong shapes', () => {
  for (const bad of [
    null,
    undefined,
    '',
    '   ',
    '204',
    '999',
    '404',
    'test',
    'room-802',
    'cust-802',
    '0802',
    '8',
    '802a',
    '802-1',
  ]) {
    assert.equal(parseGuestRoomQuery(bad as string | null | undefined), null, String(bad));
  }
});

test('trims whitespace for valid rooms', () => {
  assert.equal(parseGuestRoomQuery(' 802 '), '802');
});

test('guestRoomFromSearchParams reads only guestRoom (not room)', () => {
  const params = new URLSearchParams('room=701&guestRoom=802');
  assert.equal(guestRoomFromSearchParams(params), '802');
  assert.equal(guestRoomFromSearchParams(new URLSearchParams('room=701')), null);
  assert.equal(guestRoomFromSearchParams(new URLSearchParams('guestRoom=999')), null);
});
