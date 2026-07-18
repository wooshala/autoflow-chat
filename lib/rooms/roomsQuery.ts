// Phase 1C.1 — pure Room query helpers (DOM-free, unit-tested).
//
// Filtering respects both the shared room lifecycle (room.status) and per-user display
// state (favorites / hidden / membership), passed in as plain sets so these stay pure.

import type { Room, RoomTab } from './roomTypes';

/**
 * Case-insensitive match on title, room number, and language code. The room title
 * already embeds the language display name (e.g. "701호 · Русский"), so searching the
 * title covers language-name queries without importing the display-label map.
 */
export function matchesSearch(room: Room, rawQuery: string): boolean {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return true;
  const hay = [room.title, room.room_no ?? '', room.language ?? ''].join(' ').toLowerCase();
  return hay.includes(q);
}

export interface RoomFilter {
  search: string;
  tab: RoomTab;
  /** per-user: rooms I favorited */
  favorites: ReadonlySet<string>;
  /** per-user: rooms I hid from my list (distinct from shared room.status='archived') */
  hidden: ReadonlySet<string>;
  /** per-user: rooms I'm a member of ("내 대화방") */
  membership: ReadonlySet<string>;
}

/** Listable = the room isn't closed and I haven't hidden it. */
function isListable(room: Room, hidden: ReadonlySet<string>): boolean {
  return room.status !== 'archived' && !hidden.has(room.id);
}

function matchesTab(room: Room, f: RoomFilter): boolean {
  if (f.tab === 'mine') return f.membership.has(room.id);
  if (f.tab === 'favorites') return f.favorites.has(room.id);
  return true;
}

/** Active rooms passing search + tab. Excludes closed rooms and my hidden rooms. */
export function visibleRooms(rooms: readonly Room[], f: RoomFilter): Room[] {
  return rooms.filter((r) => isListable(r, f.hidden) && matchesSearch(r, f.search) && matchesTab(r, f));
}

/** 휴지통 — rooms I hid from my list (per-user), still honoring the search box. */
export function hiddenRooms(
  rooms: readonly Room[],
  f: Pick<RoomFilter, 'search' | 'hidden'>,
): Room[] {
  return rooms.filter((r) => f.hidden.has(r.id) && matchesSearch(r, f.search));
}

/** Most-recently-active rooms for the small "최근 대화방" section (§10). */
export function recentRooms(rooms: readonly Room[], f: RoomFilter, limit = 3): Room[] {
  return visibleRooms(rooms, f)
    .filter((r) => r.lastActiveAt)
    .sort((a, b) => (b.lastActiveAt ?? '').localeCompare(a.lastActiveAt ?? ''))
    .slice(0, limit);
}

/** Stable section ordering: defaultOrder first, then most-recent activity. */
export function byDefaultOrder(a: Room, b: Room): number {
  const ao = a.defaultOrder ?? Number.MAX_SAFE_INTEGER;
  const bo = b.defaultOrder ?? Number.MAX_SAFE_INTEGER;
  if (ao !== bo) return ao - bo;
  return (b.lastActiveAt ?? '').localeCompare(a.lastActiveAt ?? '');
}
