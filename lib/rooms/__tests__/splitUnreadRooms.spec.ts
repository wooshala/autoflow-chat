// Phase 1H.12 — the "안읽은 대화" top group: unread customer rooms float out (newest guest
// message first), the rest keep numeric order, and each room appears in exactly one group.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { splitCustomerRoomsByUnread } from '../roomsQuery.ts';
import type { Room } from '../roomTypes.ts';

const R = (id: string, order: number): Room => ({
  id,
  category: 'customer',
  dataBinding: 'mock',
  title: id,
  defaultOrder: order,
});

// caller passes customerRooms already in numeric order
const rooms = [R('cust-201', 40), R('cust-308', 41), R('cust-801', 78)];

test('no unread → empty group, others keep the incoming (numeric) order', () => {
  const { unread, others } = splitCustomerRoomsByUnread(rooms, {}, {});
  assert.deepEqual(unread.map((r) => r.id), []);
  assert.deepEqual(others.map((r) => r.id), ['cust-201', 'cust-308', 'cust-801']);
});

test('unread rooms float out, sorted by latest guest message DESC (not room number)', () => {
  const unreadMap = { 'cust-801': true, 'cust-308': true };
  const latest = {
    'cust-801': '2026-07-21T13:10:00.000Z',
    'cust-308': '2026-07-21T13:03:00.000Z',
    'cust-201': '2026-07-21T12:59:00.000Z',
  };
  const { unread, others } = splitCustomerRoomsByUnread(rooms, unreadMap, latest);
  assert.deepEqual(unread.map((r) => r.id), ['cust-801', 'cust-308']); // newest first
  assert.deepEqual(others.map((r) => r.id), ['cust-201']); // remaining, numeric
});

test('each room is in exactly one group (no duplicate display)', () => {
  const { unread, others } = splitCustomerRoomsByUnread(
    rooms,
    { 'cust-308': true },
    { 'cust-308': '2026-07-21T13:00:00.000Z' },
  );
  assert.equal(unread.length + others.length, rooms.length);
  const ids = new Set([...unread, ...others].map((r) => r.id));
  assert.equal(ids.size, rooms.length);
});

test('a read room drops from unread and returns to its numeric slot in others', () => {
  // 801 unread; 308 read → 308 sits back between 201 and (absent) 801 in numeric order
  const { unread, others } = splitCustomerRoomsByUnread(
    rooms,
    { 'cust-801': true },
    { 'cust-801': '2026-07-21T13:10:00.000Z' },
  );
  assert.deepEqual(unread.map((r) => r.id), ['cust-801']);
  assert.deepEqual(others.map((r) => r.id), ['cust-201', 'cust-308']);
});

test('does not mutate the input array', () => {
  const input = [R('cust-201', 40), R('cust-801', 78)];
  splitCustomerRoomsByUnread(input, { 'cust-801': true }, { 'cust-801': '2026-07-21T13:00:00.000Z' });
  assert.deepEqual(input.map((r) => r.id), ['cust-201', 'cust-801']);
});
