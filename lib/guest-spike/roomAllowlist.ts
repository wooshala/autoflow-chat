// Phase 2D — the hotel's real room numbers and the pure channel_key ↔ room mapping.
//
// The production guest_chat_* tables carry test channels alongside real rooms
// (e.g. `308-live`, `1h5-a`, `1h5-degrade`, `1h5-pv-35411`), so `channel_key LIKE 'room-%'`
// is NOT a sufficient filter — `room-999`-style values would also pass. Everything that
// leaves the internal summary API must match this allowlist exactly.
//
// SINGLE-TENANT ASSUMPTION: this list belongs to the one hotel this deployment serves.
// When multi-tenancy lands, room numbers stop being globally unique and this must move
// behind a (site_id, room_no) lookup. guest_chat_* has no site_id today.

/** Real room numbers. Source: RoomGuestQrCard / staff room list (2026-08). */
export const HOTEL_ROOM_NUMBERS: readonly string[] = [
  '201', '202', '203', '205', '206', '207', '208', '209',
  '301', '302', '303', '305', '306', '307', '308', '309',
  '501', '502', '503', '505', '506', '507', '508',
  '601', '602', '603', '605', '606', '607', '608',
  '701', '702', '703', '705', '706', '707', '708',
  '801', '802',
];

const ROOM_SET: ReadonlySet<string> = new Set(HOTEL_ROOM_NUMBERS);

/** `room-802` → `802`. Returns null for test channels, unknown rooms, or malformed keys. */
export function roomNumberFromChannelKey(channelKey: string | null | undefined): string | null {
  if (typeof channelKey !== 'string') return null;
  const m = /^room-(\d{3,4})$/.exec(channelKey.trim());
  if (!m) return null;
  const roomNo = m[1]!;
  return ROOM_SET.has(roomNo) ? roomNo : null;
}

/** True only for channels that map to a real room of this hotel. */
export function isRealRoomChannel(channelKey: string | null | undefined): boolean {
  return roomNumberFromChannelKey(channelKey) !== null;
}
