// Phase 2 closeout — hotel room allowlist must stay exactly 39 real rooms.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  HOTEL_ROOM_NUMBERS,
  roomNumberFromChannelKey,
  isRealRoomChannel,
} from '../roomAllowlist.ts';

/** Canonical roster (2026-08 ops confirmation). */
const EXPECTED_ROOMS = [
  '201', '202', '203', '205', '206', '207', '208', '209',
  '301', '302', '303', '305', '306', '307', '308', '309',
  '501', '502', '503', '505', '506', '507', '508',
  '601', '602', '603', '605', '606', '607', '608',
  '701', '702', '703', '705', '706', '707', '708',
  '801', '802',
] as const;

test('HOTEL_ROOM_NUMBERS has exactly 39 unique rooms', () => {
  assert.equal(HOTEL_ROOM_NUMBERS.length, 39);
  assert.equal(new Set(HOTEL_ROOM_NUMBERS).size, 39);
});

test('HOTEL_ROOM_NUMBERS matches the canonical hotel roster exactly', () => {
  assert.deepEqual([...HOTEL_ROOM_NUMBERS], [...EXPECTED_ROOMS]);
});

test('every allowlisted room maps from room-<n> channel key', () => {
  for (const room of HOTEL_ROOM_NUMBERS) {
    assert.equal(roomNumberFromChannelKey(`room-${room}`), room);
    assert.equal(isRealRoomChannel(`room-${room}`), true);
  }
});

test('test / non-roster channels are excluded from the allowlist', () => {
  const excluded = [
    '308-live',
    '1h5-a',
    '1h5-degrade',
    '1h5-pv-35411',
    'room-999',
    'room-204', // 결번
    'room-404',
    'room-test',
    'cust-802',
    'room-0802',
  ];
  for (const key of excluded) {
    assert.equal(roomNumberFromChannelKey(key), null, key);
    assert.equal(isRealRoomChannel(key), false, key);
  }
});
