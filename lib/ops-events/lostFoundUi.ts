import type { OpsEventHistoryRow } from '@/lib/ops-events/types';
import { LOST_FOUND_STATUS_UI } from '@/lib/ops-events/lostFoundFsm';
import type { LostFoundStatus } from '@/lib/ops-events/types';

export type LostFoundMessageLink = {
  id: string;
  event_no: string;
};

export function historyRowTitle(row: OpsEventHistoryRow): string {
  if (row.action === 'created') return '생성';
  if (row.action === 'status_changed') return '상태 변경';
  if (row.action === 'reopened') return '재오픈';
  return row.action;
}

export function historyRowDetail(row: OpsEventHistoryRow): string {
  if (row.action === 'created') {
    const status = row.to_status || 'registered';
    const label = LOST_FOUND_STATUS_UI[status as LostFoundStatus]?.label || status;
    return label;
  }
  if (row.from_status && row.to_status) {
    const from = LOST_FOUND_STATUS_UI[row.from_status as LostFoundStatus]?.label || row.from_status;
    const to = LOST_FOUND_STATUS_UI[row.to_status as LostFoundStatus]?.label || row.to_status;
    return `${from} → ${to}`;
  }
  return row.to_status || '';
}
