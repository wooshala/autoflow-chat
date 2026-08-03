/**
 * Phase GC-RoomList-Contrast — RoomListItem row/title classes.
 * Priority: selected > hover > unanswered > default.
 *
 * Room Navigation sidebar is always light (`bg-gray-50`). Do not use `dark:text-*` /
 * `dark:bg-*` / `dark:hover:*` here — OS dark mode would wash titles to near-white
 * on the light panel.
 */

export const ROOM_LIST_SELECTED_TITLE_COLOR = '#1f2937'; // Tailwind gray-800

export function roomListRowSurfaceClass(opts: {
  active: boolean;
  unanswered: boolean;
}): string {
  if (opts.active) {
    return 'bg-white ring-1 ring-inset ring-blue-300 hover:bg-white';
  }
  if (opts.unanswered) {
    return 'bg-[#FFF3F3] hover:bg-white';
  }
  return 'hover:bg-white';
}

export function roomListTitleClass(opts: {
  active: boolean;
  unanswered: boolean;
}): string {
  if (opts.active) {
    // Keep ! + selected inline style (Phase GC-Selection-Style) — no dark: light text.
    return 'truncate font-medium !text-gray-800';
  }
  if (opts.unanswered) {
    return 'truncate font-semibold text-gray-900 group-hover:text-gray-900';
  }
  // default: gray-800; hover → gray-900 (group is the row)
  return 'truncate font-medium text-gray-800 group-hover:text-gray-900';
}

/** Selected-only inline pin; do not expand to other states (class contract covers them). */
export function roomListTitleStyle(opts: { active: boolean }): { color: string } | undefined {
  return opts.active ? { color: ROOM_LIST_SELECTED_TITLE_COLOR } : undefined;
}
