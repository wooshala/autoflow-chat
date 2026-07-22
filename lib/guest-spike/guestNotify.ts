// Phase 2D — PURE fire-decision for the guest-chat Windows notification. The OS notification /
// sound / body are the EXISTING primitives (showBrowserNotification / playNotificationTone /
// normalizeNotifyBody); this only decides WHEN to fire. Import-free so it runs under node --test.
//
// Known limitation (accepted): the summary poll exposes only the LATEST guest message per channel,
// so if several messages arrive in one 5s interval only the last one notifies.

export const GUEST_NOTIFY_TITLE = 'Guest Chat';

/** Fire only for a genuinely NEW guest message (dedup by id), never when the staff is already
 *  viewing that room, and never for messages that predate the first summary (`seeded`). */
export function shouldNotifyGuestMessage(p: {
  latestId: string | null;
  isNew: boolean; //   latestId differs from the last id handled for this room
  isViewing: boolean; // staff is looking at THIS room AND the window is focused → they see it live
  seeded: boolean; //  baseline captured (don't notify for pre-existing messages)
}): boolean {
  if (!p.seeded) return false;
  if (!p.latestId) return false;
  if (!p.isNew) return false;
  if (p.isViewing) return false;
  return true;
}
