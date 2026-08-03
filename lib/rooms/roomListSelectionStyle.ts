/**
 * Phase GC-Selection-Style — pure class helpers for RoomListItem surfaces.
 * Priority: selected > hover > unanswered > default.
 */

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
    // Always dark text on light selection (avoids white-on-white under OS dark mode).
    return 'truncate font-medium text-gray-800';
  }
  if (opts.unanswered) {
    return 'truncate font-semibold text-gray-800 dark:text-gray-100';
  }
  return 'truncate font-medium text-gray-800 dark:text-gray-100';
}
