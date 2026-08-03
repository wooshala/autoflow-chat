// Phase GC-Notification-Completion — document title coordination (guest unanswered vs staff).

const DOC_TITLE_BASE = 'AutoFlow 채팅';

let guestUnansweredTotal = 0;
let staffUnreadTotal = 0;

function applyDocumentTitle(): void {
  if (typeof document === 'undefined') return;
  if (guestUnansweredTotal > 0) {
    document.title = `${DOC_TITLE_BASE} (${guestUnansweredTotal})`;
    return;
  }
  if (staffUnreadTotal > 0) {
    document.title = `(${staffUnreadTotal}) ${DOC_TITLE_BASE}`;
    return;
  }
  document.title = DOC_TITLE_BASE;
}

/** Guest Room Nav unanswered total → `AutoFlow 채팅 (N)`. */
export function setGuestUnansweredTitleCount(n: number): void {
  guestUnansweredTotal = Math.max(0, Math.floor(n) || 0);
  applyDocumentTitle();
}

/** Staff ops unread bump → `(N) AutoFlow 채팅` when no guest unanswered. */
export function setStaffUnreadTitleCount(n: number): void {
  staffUnreadTotal = Math.max(0, Math.floor(n) || 0);
  applyDocumentTitle();
}

export function resetDocumentTitleBadgeForTests(): void {
  guestUnansweredTotal = 0;
  staffUnreadTotal = 0;
}
