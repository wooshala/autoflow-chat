// Phase 1C.1 — pure Room query tests. Run: node --test lib/rooms/__tests__/roomsQuery.spec.ts
// Self-contained fixtures (no `@/` alias) so Node type-stripping resolves imports.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  matchesSearch,
  visibleRooms,
  hiddenRooms,
  recentRooms,
  byDefaultOrder,
  type RoomFilter,
} from '../roomsQuery.ts';
import type { Room } from '../roomTypes.ts';

const ROOMS: Room[] = [
  { id: 'operations', category: 'operations', dataBinding: 'live', title: '운영 채팅', defaultOrder: 0, status: 'active', lastActiveAt: '2026-07-18T10:20:00+09:00' },
  { id: 'staff-cleaning', category: 'team', dataBinding: 'mock', title: '청소팀', defaultOrder: 10, status: 'active', lastActiveAt: '2026-07-18T10:05:00+09:00' },
  { id: 'cust-503', category: 'customer', dataBinding: 'mock', title: '503호 · 中文(简体)', defaultOrder: 40, room_no: '503', language: 'zh-CN', status: 'active', lastActiveAt: '2026-07-18T09:15:00+09:00' },
  { id: 'cust-701', category: 'customer', dataBinding: 'mock', title: '701호 · Русский', defaultOrder: 43, room_no: '701', language: 'ru', status: 'active', lastActiveAt: '2026-07-18T19:25:00+09:00' },
  { id: 'closed-1', category: 'team', dataBinding: 'mock', title: '종료된 임시방', defaultOrder: 99, status: 'archived', lastActiveAt: '2026-07-17T09:00:00+09:00' },
];

const base = (over: Partial<RoomFilter> = {}): RoomFilter => ({
  search: '',
  tab: 'all',
  favorites: new Set(),
  hidden: new Set(),
  membership: new Set(),
  ...over,
});

test('matchesSearch hits title, room number, and language code', () => {
  const ru = ROOMS[3]!;
  assert.equal(matchesSearch(ru, ''), true, 'empty query matches all');
  assert.equal(matchesSearch(ru, '701'), true, 'room number');
  assert.equal(matchesSearch(ru, 'Русский'), true, 'language name in title');
  assert.equal(matchesSearch(ru, 'ru'), true, 'language code');
  assert.equal(matchesSearch(ru, '503'), false, 'non-match');
});

test('visibleRooms excludes archived (shared) rooms', () => {
  const out = visibleRooms(ROOMS, base());
  assert.ok(!out.some((r) => r.id === 'closed-1'), 'room.status archived is never listable');
  assert.equal(out.length, 4);
});

test('visibleRooms excludes my hidden rooms and applies search', () => {
  const out = visibleRooms(ROOMS, base({ search: '503', hidden: new Set(['cust-503']) }));
  assert.equal(out.length, 0, 'hidden 503 is gone even though it matches search');
});

test('tab=mine filters by membership set', () => {
  const out = visibleRooms(ROOMS, base({ tab: 'mine', membership: new Set(['operations', 'cust-701']) }));
  assert.deepEqual(out.map((r) => r.id).sort(), ['cust-701', 'operations']);
});

test('tab=favorites filters by the favorites set', () => {
  const out = visibleRooms(ROOMS, base({ tab: 'favorites', favorites: new Set(['cust-701']) }));
  assert.deepEqual(out.map((r) => r.id), ['cust-701']);
});

test('hiddenRooms returns only my hidden rooms, still searchable', () => {
  const hidden = new Set(['cust-503', 'cust-701']);
  assert.equal(hiddenRooms(ROOMS, { search: '', hidden }).length, 2);
  assert.deepEqual(hiddenRooms(ROOMS, { search: '701', hidden }).map((r) => r.id), ['cust-701']);
});

test('recentRooms sorts by lastActiveAt desc and respects limit', () => {
  const out = recentRooms(ROOMS, base(), 2);
  assert.deepEqual(out.map((r) => r.id), ['cust-701', 'operations']);
});

test('byDefaultOrder sorts by defaultOrder then recency', () => {
  const out = [...ROOMS].filter((r) => r.status !== 'archived').sort(byDefaultOrder);
  assert.deepEqual(out.map((r) => r.id), ['operations', 'staff-cleaning', 'cust-503', 'cust-701']);
});
