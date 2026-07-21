// Phase 1I.1-B (option 2) — PURE helper for the Customer Information context. Only room-number
// derivation remains: phone masking, match-status mapping, and reservation-confidence helpers were
// removed with the derived reservation (Phase 1I.1-C — no authoritative stay source). Import-free
// so it stays unit-testable.

/** room-<no> → <no> (the only place a room number exists for a guest chat). null if not a room channel. */
export function roomNoFromChannelKey(channelKey: string): string | null {
  const m = /^room-(\d{3,4})$/.exec(channelKey);
  return m ? m[1] : null;
}
