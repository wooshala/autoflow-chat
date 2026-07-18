// Phase 1C — Room Navigation feature flag (separate from the ops-console layout flag).
//
// OFF by default. NEXT_PUBLIC_CHAT_OPS_CONSOLE turns on the 3-panel layout; this turns
// on the Room-centric left navigation INSIDE that layout. The page additionally gates
// this on the 3-panel actually being active, so Room Navigation fail-safes back to the
// existing sidebar when the layout is off (see app/chat/page.tsx).

export function isRoomNavigationEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ROOM_NAVIGATION === '1';
}

// Phase 1E.1 — per-device runtime override so a single operational EXE can pilot Room
// Navigation without exposing it to everyone (Production ships with the build flag = 0).
//   'on'  → force Room Navigation ON  regardless of the build flag
//   'off' → force it OFF regardless of the build flag
//   null  → follow the build flag (NEXT_PUBLIC_ROOM_NAVIGATION)
// Fail-safe still applies: Room Navigation never turns on unless the 3-panel ops console
// (showOpsConsole) is active, even with override='on'.

export const ROOM_NAV_OVERRIDE_KEY = 'AUTOFLOW_ROOM_NAV_OVERRIDE';

export type RoomNavigationOverride = 'on' | 'off' | null;

/** Pure parser: only exact 'on'/'off' count; anything else (incl. null/garbage) → null. */
export function parseRoomNavigationOverride(raw: string | null | undefined): RoomNavigationOverride {
  return raw === 'on' ? 'on' : raw === 'off' ? 'off' : null;
}

/** Read the override from localStorage (client only; SSR/no-storage → null). */
export function getRoomNavigationRuntimeOverride(): RoomNavigationOverride {
  if (typeof window === 'undefined') return null;
  try {
    return parseRoomNavigationOverride(window.localStorage.getItem(ROOM_NAV_OVERRIDE_KEY));
  } catch {
    return null;
  }
}

/** Pure gate resolution (unit-tested). Fail-safe: false unless the ops console is active. */
export function resolveRoomNavigationEnabled(args: {
  showOpsConsole: boolean;
  buildEnabled: boolean;
  override: RoomNavigationOverride;
}): boolean {
  const { showOpsConsole, buildEnabled, override } = args;
  if (!showOpsConsole) return false;
  return override === 'on' || (override !== 'off' && buildEnabled);
}
