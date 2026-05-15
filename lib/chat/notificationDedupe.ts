import type { NotificationTone } from '@/lib/chat/notificationTone';

const lastPlayedAt = new Map<string, number>();
const MAX_ENTRIES = 500;

export function makeNotificationDedupeKey(params: {
  roomNumber: string | null;
  mainCategory: string;
  urgent: boolean;
  fallbackText?: string;
}) {
  const roomPart =
    params.roomNumber ||
    (params.fallbackText ? params.fallbackText.slice(0, 20).replace(/\s+/g, ' ').trim() : 'unknown');
  return `${roomPart}::${params.mainCategory}::${params.urgent ? 'urgent' : 'normal'}`;
}

export function getNotificationDedupeWindowMs(tone: NotificationTone): number {
  switch (tone) {
    case 'urgent':
      return 10_000;
    case 'warn':
    case 'info':
      return 30_000;
    case 'soft':
      return 20_000;
    case 'silent':
    default:
      return 0;
  }
}

function cleanup(now: number) {
  if (lastPlayedAt.size <= MAX_ENTRIES) return;

  // Drop entries older than 2 minutes first.
  const cutoff = now - 120_000;
  for (const [k, v] of lastPlayedAt.entries()) {
    if (v < cutoff) lastPlayedAt.delete(k);
  }

  // If still too big, drop oldest.
  if (lastPlayedAt.size <= MAX_ENTRIES) return;
  const sorted = Array.from(lastPlayedAt.entries()).sort((a, b) => a[1] - b[1]);
  const toDrop = Math.max(0, lastPlayedAt.size - MAX_ENTRIES);
  for (let i = 0; i < toDrop; i++) lastPlayedAt.delete(sorted[i][0]);
}

export function shouldPlayNotificationSound(key: string, tone: NotificationTone, now = Date.now()): boolean {
  if (tone === 'silent') return false;

  const windowMs = getNotificationDedupeWindowMs(tone);
  if (windowMs <= 0) return true;

  const prev = lastPlayedAt.get(key);
  if (prev && now - prev < windowMs) {
    cleanup(now);
    return false;
  }

  lastPlayedAt.set(key, now);
  cleanup(now);
  return true;
}

