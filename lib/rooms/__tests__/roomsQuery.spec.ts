// Phase 1C — pure Room query tests. Run: node --test lib/rooms/__tests__/roomsQuery.spec.ts
// Self-contained fixtures (no `@/` alias) so Node type-stripping resolves imports.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  matchesSearch,
  visibleRooms,
  archivedRooms,
  recentRooms,
  type RoomFilter,
} from '../roomsQuery.ts';
import type { Room } from '../roomTypes.ts';

const ROOMS: Room[] = [
  { id: 'staff-global', kind: 'staff-global', title: '직원 전체', isMine: true, lastActiveAt: '2026-07-18T10:20:00+09:00' },
  { id: 'staff-cleaning', kind: 'staff-mock', title: '청소팀 전체', isMine: true, isDev: true, lastActiveAt: '2026-07-18T10:05:00+09:00' },
  { id: 'cust-503', kind: 'customer', title: '503호 · 中文(简体)', room_no: '503', language: 'zh-CN', isMine: true, isDev: true, lastActiveAt: '2026-07-18T09:15:00+09:00' },
  { id: 'cust-701', kind: 'customer', title: '701호 · Русский', room_no: '701', language: 'ru', isDev: true, lastActiveAt: '2026-07-18T19:25:00+09:00' },
];

const base = (over: Partial<RoomFilter> = {}): RoomFilter => ({
  search: '',
  tab: 'all',
  favorites: new Set(),
  archived: new Set(),
  ...over,
});

test('matchesSearch hits title, room number, and language name', () => {
  const ru = ROOMS[3]!;
  assert.equal(matchesSearch(ru, ''), true, 'empty query matches all');
  assert.equal(matchesSearch(ru, '701'), true, 'room number');
  assert.equal(matchesSearch(ru, 'Русский'), true, 'language display name');
  assert.equal(matchesSearch(ru, 'ru'), true, 'language code');
  assert.equal(matchesSearch(ru, '503'), false, 'non-match');
});

test('visibleRooms excludes archived and applies search', () => {
  const out = visibleRooms(ROOMS, base({ search: '503', archived: new Set(['cust-503']) }));
  assert.equal(out.length, 0, 'archived 503 is hidden even when it matches search');
});

test('tab=mine filters to isMine rooms', () => {
  const out = visibleRooms(ROOMS, base({ tab: 'mine' }));
  assert.deepEqual(out.map((r) => r.id).sort(), ['cust-503', 'staff-cleaning', 'staff-global']);
});

test('tab=favorites filters by the favorites set', () => {
  const out = visibleRooms(ROOMS, base({ tab: 'favorites', favorites: new Set(['cust-701']) }));
  assert.deepEqual(out.map((r) => r.id), ['cust-701']);
});

test('archivedRooms returns only archived, still searchable', () => {
  const archived = new Set(['cust-503', 'cust-701']);
  assert.equal(archivedRooms(ROOMS, { search: '', archived }).length, 2);
  assert.deepEqual(archivedRooms(ROOMS, { search: '701', archived }).map((r) => r.id), ['cust-701']);
});

test('recentRooms sorts by lastActiveAt desc and respects limit', () => {
  const out = recentRooms(ROOMS, base(), 2);
  assert.deepEqual(out.map((r) => r.id), ['cust-701', 'staff-global']);
});

test('recentRooms drops archived rooms via visibleRooms', () => {
  const out = recentRooms(ROOMS, base({ archived: new Set(['cust-701']) }), 2);
  assert.deepEqual(out.map((r) => r.id), ['staff-global', 'staff-cleaning']);
});
