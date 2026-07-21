// Phase 1H.9 — PURE generator: hotel room-number roster → Room-Navigation customer rooms.
// Runtime-import-free (type-only Room import is erased) so it is unit-testable under node --test.
//
// `dataBinding: 'mock'` is the Room-Navigation binding CLASS (Phase 1C model), NOT the message
// store — customer-room messages use the REAL guest API/DB (guest_chat_*). No static `language`:
// it is guest-selected per session (Phase 1H.7). Rooms are ordered by ASCENDING room number
// (numeric, so 209 precedes 301 and 802 is last — never string order like 1001 before 301).

import type { Room } from './roomTypes';

export function buildCustomerRooms(roomNos: readonly string[], orderStart: number): Room[] {
  return [...roomNos]
    .sort((a, b) => Number(a) - Number(b))
    .map((roomNo, index): Room => ({
      id: `cust-${roomNo}`,
      category: 'customer',
      dataBinding: 'mock',
      title: `${roomNo}호`,
      colorToken: 'customer',
      defaultOrder: orderStart + index,
      room_no: roomNo,
      status: 'active',
    }));
}
