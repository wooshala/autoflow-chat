/**
 * Phase GC-Selection-Style — pure class helpers for RoomListItem surfaces.
 * Priority: selected > hover > unanswered > default.
 *
 * Selected title color is also forced via inline `style.color = #1f2937` (gray-800)
 * in RoomListItem — class alone can lose to cascade / dark: utilities in WebView.
 */

export const ROOM_LIST_SELECTED_TITLE_COLOR = '#1f2937'; // Tailwind gray-800

export function roomListRowSurfaceClass(opts: {
  active: boolean;
  unanswered: boolean;
}): string {
  if (opts.active) {
    // Ops baseline selection; pin hover so dark:hover cannot override.
    return 'bg-white ring-1 ring-inset ring-blue-300 hover:bg-white';
  }
  if (opts.unanswered) {
    return 'bg-[#FFF3F3] hover:bg-white dark:bg-red-950/35 dark:hover:bg-gray-900';
  }
  return 'hover:bg-white dark:hover:bg-gray-900';
}

export function roomListTitleClass(opts: {
  active: boolean;
  unanswered: boolean;
}): string {
  if (opts.active) {
    // ! important beats competing text-* utilities; inline style is the hard guarantee.
    return 'truncate font-medium !text-gray-800';
  }
  if (opts.unanswered) {
    return 'truncate font-semibold text-gray-800 dark:text-gray-100';
  }
  return 'truncate font-medium text-gray-800 dark:text-gray-100';
}

export function roomListTitleStyle(opts: { active: boolean }): { color: string } | undefined {
  return opts.active ? { color: ROOM_LIST_SELECTED_TITLE_COLOR } : undefined;
}
