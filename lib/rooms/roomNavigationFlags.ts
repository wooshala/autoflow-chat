// Phase 1C — Room Navigation feature flag (separate from the ops-console layout flag).
//
// OFF by default. NEXT_PUBLIC_CHAT_OPS_CONSOLE turns on the 3-panel layout; this turns
// on the Room-centric left navigation INSIDE that layout. The page additionally gates
// this on the 3-panel actually being active, so Room Navigation fail-safes back to the
// existing sidebar when the layout is off (see app/chat/page.tsx).

export function isRoomNavigationEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ROOM_NAVIGATION === '1';
}
