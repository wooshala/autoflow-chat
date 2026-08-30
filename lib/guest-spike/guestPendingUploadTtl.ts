// IMAGE-CHAT-01A — pending upload TTL (client-safe constant).

/** Pending upload tokens expire after 60 minutes (server-enforced at message attach). */
export const GUEST_PENDING_UPLOAD_TTL_MS = 60 * 60 * 1000;

export function isPendingUploadExpired(createdAt: string, nowMs: number = Date.now()): boolean {
  const created = Date.parse(createdAt);
  if (!Number.isFinite(created)) return true;
  return nowMs - created > GUEST_PENDING_UPLOAD_TTL_MS;
}
