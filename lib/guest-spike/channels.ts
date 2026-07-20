// Phase 1H.2 — SINGLE SOURCE OF TRUTH for room ↔ guest-channel mapping.
// RULE: no component may branch on a room id/number (e.g. `if (room === '308')`).
// Everything resolves the channel via lookupChannelKey(roomId) ONLY. Adding a live
// room = add one entry here; nothing else changes.
//
// TODO(canonical-namespace): rename guest-spike → guest-chat once the 308 pilot is
// stable (separate refactor step; NOT part of this integration).

const ROOM_CHANNEL: Record<string, string> = {
  // Room Navigation room id → guest channel key (must match the QR target /g/<key>).
  // Phase 1H.4 — OPERATIONAL channel. Real customers use /g/room-308 (this mapping drives
  // the /chat 308 staff room). The DEV/QA channel 'room-308-live' stays reachable directly
  // via /g/room-308-live + /g-staff/room-308-live (dynamic routes) and is NOT wired here,
  // so operational and dev data never mix. Promote new features dev(room-308-live) → op(room-308).
  'cust-308': 'room-308',
};

/** Resolve a room's live guest channel, or null when the room is not wired to one. */
export function lookupChannelKey(roomId: string): string | null {
  return ROOM_CHANNEL[roomId] ?? null;
}
