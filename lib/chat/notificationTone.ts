import type { ClassificationResult } from '@/lib/chat/classifyMessageCategory';

export type NotificationTone = 'urgent' | 'warn' | 'info' | 'soft' | 'silent';

export function getNotificationTone(result: ClassificationResult): NotificationTone {
  if (result.flags.urgent) return 'urgent';

  // Status-only signals should be less noisy (often internal updates).
  if (result.flags.status && result.mainCategory === 'general') {
    return 'soft';
  }

  switch (result.mainCategory) {
    case 'repair':
    case 'environment':
      return 'warn';
    case 'cleaning':
    case 'turnover':
      return 'info';
    case 'general':
    default:
      return result.flags.request ? 'soft' : 'silent';
  }
}

