// Phase GC-Notification-Completion — pure helpers for guest desktop notify UX.
// No API / unanswered-fold changes. Import-light for node --test.

/** Toast title: room-first (e.g. "201호"). */
export function guestToastTitle(roomNumber: string | null | undefined): string {
  const r = String(roomNumber || '').trim();
  if (!r) return 'Guest Chat';
  return /호$/.test(r) ? r : `${r}호`;
}

/** Toast body: guest line + preview (room number already in title). */
export function guestToastBody(preview: string | null | undefined): string {
  const p = String(preview || '').trim() || '새 메시지가 도착했습니다';
  return `손님:\n${p}`;
}

/** Sum guest unanswered message counts across rooms (sidebar badge total). */
export function totalUnansweredMessages(
  byRoom: Record<string, { guestMessageCount: number } | undefined>,
): number {
  let n = 0;
  for (const v of Object.values(byRoom)) {
    const c = v?.guestMessageCount ?? 0;
    if (c > 0) n += c;
  }
  return n;
}

/** Document title: `AutoFlow 채팅 (3)` when count > 0. */
export function guestChatDocumentTitle(unansweredTotal: number): string {
  const base = 'AutoFlow 채팅';
  return unansweredTotal > 0 ? `${base} (${unansweredTotal})` : base;
}
