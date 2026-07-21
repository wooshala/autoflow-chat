// Phase 1H.9 — the staff customer-room list is generated from the operational room roster
// (SSOT: STAFF_ROOM_OPTIONS), so every real room (incl. 201) appears and maps cleanly to its
// guest channel. Guards the roster invariants + the generation.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { STAFF_ROOM_OPTIONS } from '../../chat/staffRoomOptions.ts';
import { buildCustomerRooms } from '../customerRoomsFromRoster.ts';

test('room roster (SSOT): 39 rooms, no duplicates, strictly ascending by number', () => {
  assert.equal(STAFF_ROOM_OPTIONS.length, 39);
  assert.equal(new Set(STAFF_ROOM_OPTIONS).size, 39); // no duplicate room numbers
  const nums = STAFF_ROOM_OPTIONS.map(Number);
  for (let i = 1; i < nums.length; i++) {
    assert.ok(nums[i] > nums[i - 1], `roster not ascending near ${STAFF_ROOM_OPTIONS[i]}`);
  }
  for (const r of ['201', '308', '701']) assert.ok(STAFF_ROOM_OPTIONS.includes(r), `roster missing ${r}`);
});

test('every active roster room becomes exactly one customer room with consistent id/room_no/title', () => {
  const rooms = buildCustomerRooms(STAFF_ROOM_OPTIONS, 40);
  assert.equal(rooms.length, STAFF_ROOM_OPTIONS.length); // all rooms generated, no drops
  assert.equal(new Set(rooms.map((r) => r.id)).size, rooms.length); // unique room ids
  for (const r of rooms) {
    assert.equal(r.category, 'customer');
    assert.equal(r.dataBinding, 'mock');
    assert.match(r.id, /^cust-\d{3,4}$/);
    const no = r.id.slice('cust-'.length);
    assert.equal(r.room_no, no);
    assert.equal(r.title, `${no}호`);
    assert.equal(r.language, undefined); // language is guest-selected per session, never static
  }
});

test('generated rooms include 201 and 308 and are ordered by ascending room number', () => {
  const rooms = buildCustomerRooms(STAFF_ROOM_OPTIONS, 40);
  const ids = rooms.map((r) => r.id);
  assert.ok(ids.includes('cust-201'));
  assert.ok(ids.includes('cust-308'));
  const nums = rooms.map((r) => Number(r.room_no));
  for (let i = 1; i < nums.length; i++) assert.ok(nums[i] > nums[i - 1]); // numeric order preserved
  // defaultOrder is monotonic with room number (drives RoomList sort)
  for (let i = 1; i < rooms.length; i++) assert.ok(rooms[i].defaultOrder! > rooms[i - 1].defaultOrder!);
});

test('unsorted input is still emitted in ascending numeric order (not string order)', () => {
  const rooms = buildCustomerRooms(['301', '209', '1001', '202'], 40);
  assert.deepEqual(rooms.map((r) => r.room_no), ['202', '209', '301', '1001']);
});
