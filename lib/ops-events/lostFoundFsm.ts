import type { LostFoundStatus } from '@/lib/ops-events/types';
import { LOST_FOUND_TERMINAL_STATUSES } from '@/lib/ops-events/types';

const TRANSITIONS: Record<LostFoundStatus, LostFoundStatus[]> = {
  // 'returned': 주운 물건을 주인이 보관 절차 전에 바로 찾아가는 실제 운영 상황을 반영(찾아감 직접 처리).
  registered: ['stored', 'returned', 'cancelled'],
  stored: ['owner_notified', 'returned', 'disposed', 'cancelled'],
  owner_notified: ['returned', 'disposed'],
  returned: ['stored'],
  disposed: ['stored'],
  cancelled: ['registered']
};

export function isLostFoundTerminal(status: LostFoundStatus): boolean {
  return (LOST_FOUND_TERMINAL_STATUSES as readonly string[]).includes(status);
}

export function isLostFoundTransitionAllowed(from: LostFoundStatus, to: LostFoundStatus): boolean {
  if (from === to) return false;
  return (TRANSITIONS[from] || []).includes(to);
}

export function lostFoundTransitionAction(
  from: LostFoundStatus,
  to: LostFoundStatus
): 'status_changed' | 'reopened' {
  if (isLostFoundTerminal(from)) return 'reopened';
  return 'status_changed';
}

export const LOST_FOUND_STATUS_UI: Record<
  LostFoundStatus,
  { label: string; badge: string }
> = {
  registered: { label: '접수', badge: 'bg-blue-100 text-blue-800' },
  stored: { label: '보관', badge: 'bg-indigo-100 text-indigo-800' },
  owner_notified: { label: '연락완료', badge: 'bg-purple-100 text-purple-800' },
  returned: { label: '인계', badge: 'bg-green-100 text-green-800' },
  disposed: { label: '폐기', badge: 'bg-gray-200 text-gray-700' },
  cancelled: { label: '취소', badge: 'bg-red-100 text-red-800' }
};
