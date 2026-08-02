// Phase GC-Notification — PURE helpers for staff Room Nav unanswered badges.
// Counts / stale age come from the existing unanswered-summary feed (same as ledger).

/** Soft threshold matching ledger banner (≥24h → long-unanswered). */
export const UNANSWERED_STALE_MS = 24 * 60 * 60 * 1000;

export type ChannelUnansweredBadge = {
  guestMessageCount: number;
  firstUnansweredAt: string;
};

export type ChannelUnansweredBadgeMap = Record<string, ChannelUnansweredBadge>;

/** Badge label: 1–99 as digits, 100+ as `99+`. */
export function formatUnansweredBadgeCount(count: number): string {
  if (!Number.isFinite(count) || count < 1) return '';
  if (count > 99) return '99+';
  return String(Math.floor(count));
}

/** Long-unanswered when first unanswered guest message is ≥24h old. */
export function isUnansweredStale(firstUnansweredAt: string, nowMs: number = Date.now()): boolean {
  const t = Date.parse(firstUnansweredAt);
  if (Number.isNaN(t)) return false;
  return nowMs - t >= UNANSWERED_STALE_MS;
}
