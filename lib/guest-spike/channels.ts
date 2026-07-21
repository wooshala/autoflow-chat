// Phase 1H.2 / 1H.9 — SINGLE SOURCE OF TRUTH for room ↔ guest-channel mapping.
// RULE: no component may branch on a room id/number. A customer room `cust-<roomNo>` resolves
// to the guest channel `room-<roomNo>` by a PURE rule (no per-room entry). Adding a hotel room
// is a single change in the room roster (lib/chat/staffRoomOptions.ts → lib/rooms/roomsMock.ts);
// nothing changes here.
//
// NOTE: the DEV/QA channel 'room-308-live' is reached DIRECTLY via /g/room-308-live +
// /g-staff/room-308-live (dynamic routes) and is NOT a Room Navigation room, so it needs no
// mapping here — operational and dev data never mix.
//
// TODO(canonical-namespace): rename guest-spike → guest-chat once the pilot is stable.

/** Resolve a customer room's live guest channel, or null when the id is not a customer room. */
export function lookupChannelKey(roomId: string): string | null {
  const match = /^cust-(\d{3,4})$/.exec(roomId);
  return match ? `room-${match[1]}` : null;
}
