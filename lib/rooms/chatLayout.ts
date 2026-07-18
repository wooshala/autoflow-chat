// Phase 1F.1 — pure left-navigation selection. Decides WHICH left panel (if any) the
// /chat page shows, given the layout mode, the Room Navigation feature intent, and the
// viewport. DOM-free / no React / no localStorage → unit-tested.
//
// Key rules:
//   - standard layout (ops console OFF): default has NO left panel. Room Navigation is
//     added ONLY on desktop when enabled. Mobile always → 'none' (no horizontal layout).
//   - ops layout (ops console ON): left is the existing ChatParticipantSidebar, swapped
//     to RoomNavigation when enabled (unchanged from Phase 1C behavior).

export type ChatLayoutMode = 'standard' | 'ops';

export type LeftNavigationMode = 'none' | 'participant-sidebar' | 'room-navigation';

export function resolveLeftNavigationMode(args: {
  layoutMode: ChatLayoutMode;
  roomNavigationEnabled: boolean;
  isMobileViewport: boolean;
}): LeftNavigationMode {
  const { layoutMode, roomNavigationEnabled, isMobileViewport } = args;

  if (layoutMode === 'standard') {
    if (isMobileViewport) return 'none'; // mobile standard chat: never a left panel
    return roomNavigationEnabled ? 'room-navigation' : 'none';
  }

  // ops layout
  return roomNavigationEnabled ? 'room-navigation' : 'participant-sidebar';
}
