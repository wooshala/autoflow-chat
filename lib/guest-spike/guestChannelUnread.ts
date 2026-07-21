// Phase 1H.11 — PURE unread decision for a staff room's customer channel. "Unread" = there is a
// GUEST message newer than what this browser last viewed, and the room isn't currently open.
// Compares against latest_guest_message_at (NOT latest_sender_type): a staff reply being the
// newest message must NOT clear an earlier unread guest message.

export function isGuestChannelUnread(params: {
  latestGuestMessageAt: string | null;
  lastViewedAt: string | null;
  isSelected: boolean;
}): boolean {
  const { latestGuestMessageAt, lastViewedAt, isSelected } = params;
  if (isSelected) return false; // the open room is being read now
  if (!latestGuestMessageAt) return false; // no guest message at all
  const latest = Date.parse(latestGuestMessageAt);
  if (Number.isNaN(latest)) return false; // unparseable → don't fabricate an alert
  if (!lastViewedAt) return true; // never viewed → a guest message is unread
  const viewed = Date.parse(lastViewedAt);
  if (Number.isNaN(viewed)) return true; // corrupt stored value → treat as never viewed
  return latest > viewed;
}
