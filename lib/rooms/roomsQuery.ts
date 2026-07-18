// Phase 1C — pure Room query helpers (DOM-free, unit-tested).
//
// The point of Room Navigation is: when there are many rooms, an operator instantly
// finds and switches to the one they want (§16). These pure functions back the
// search / tab / favorites / trash behavior with no React or DB involved.

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

function matchesTab(room: Room, tab: RoomTab, favorites: ReadonlySet<string>): boolean {
  if (tab === 'mine') return Boolean(room.isMine);
  if (tab === 'favorites') return favorites.has(room.id);
  return true;
}

export interface RoomFilter {
  search: string;
  tab: RoomTab;
  favorites: ReadonlySet<string>;
  archived: ReadonlySet<string>;
}

/**
 * Active rooms (not archived) passing the current search + tab. Archived rooms are
 * excluded here and surface only via {@link archivedRooms} (the 휴지통 section).
 */
export function visibleRooms(rooms: readonly Room[], f: RoomFilter): Room[] {
  return rooms.filter(
    (r) => !f.archived.has(r.id) && matchesSearch(r, f.search) && matchesTab(r, f.tab, f.favorites),
  );
}

/** Archived rooms (휴지통), still honoring the search box so trash is searchable too. */
export function archivedRooms(rooms: readonly Room[], f: Pick<RoomFilter, 'search' | 'archived'>): Room[] {
  return rooms.filter((r) => f.archived.has(r.id) && matchesSearch(r, f.search));
}

/** Most-recently-active rooms for the small "최근 대화방" section (§10). */
export function recentRooms(rooms: readonly Room[], f: RoomFilter, limit = 3): Room[] {
  return visibleRooms(rooms, f)
    .filter((r) => r.lastActiveAt)
    .sort((a, b) => (b.lastActiveAt ?? '').localeCompare(a.lastActiveAt ?? ''))
    .slice(0, limit);
}
