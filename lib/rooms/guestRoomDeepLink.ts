// Phase 4A — /chat?guestRoom=802 deep link (pure, unit-tested).
// External contract uses the hotel room number only — never cust-* UI ids.
// Invalid / unknown values return null (caller keeps default /chat behavior).

// Relative import so `node --test` can load this without the `@/` alias.
import { HOTEL_ROOM_NUMBERS } from '../guest-spike/roomAllowlist';

const ROOM_SET: ReadonlySet<string> = new Set(HOTEL_ROOM_NUMBERS);

/**
 * Parse `guestRoom` query value → canonical room number, or null.
 * Accepts "802", " 802 ", rejects "204", "999", "test", "room-802", "cust-802".
 */
export function parseGuestRoomQuery(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!/^\d{3,4}$/.test(trimmed)) return null;
  return ROOM_SET.has(trimmed) ? trimmed : null;
}

/** Internal Room Navigation id for a validated room number. */
export function customerRoomIdFromGuestRoom(roomNumber: string): string {
  return `cust-${roomNumber}`;
}

/** Read guestRoom from a querystring / URLSearchParams-like source. */
export function guestRoomFromSearchParams(
  params: { get(name: string): string | null },
): string | null {
  return parseGuestRoomQuery(params.get('guestRoom'));
}
