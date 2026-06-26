// Staff work status (operational state) — shared by staff-chat (self picker) and
// the admin participant panel. This is separate from online/offline app state.

export type StaffWorkStatus =
  | 'available'
  | 'cleaning'
  | 'break'
  | 'outside'
  | 'off_duty'
  | 'revoked';

export type StaffWorkStatusOption = {
  key: StaffWorkStatus;
  label: string;
  icon: string;
  /** Sort priority for the admin list (lower = shown first). */
  order: number;
};

/** Picker options shown to staff (excludes 'revoked', which the admin controls). */
export const STAFF_WORK_STATUS_OPTIONS: StaffWorkStatusOption[] = [
  { key: 'available', label: '근무 가능', icon: '🟢', order: 0 },
  { key: 'cleaning', label: '청소 중', icon: '🧹', order: 1 },
  { key: 'break', label: '휴식', icon: '🍽️', order: 2 },
  { key: 'outside', label: '외출', icon: '🚗', order: 3 },
  { key: 'off_duty', label: '퇴근', icon: '🏁', order: 4 }
];

const REVOKED_META: StaffWorkStatusOption = {
  key: 'revoked',
  label: '내보냄',
  icon: '🔴',
  order: 5
};

const BY_KEY: Record<string, StaffWorkStatusOption> = {
  ...Object.fromEntries(STAFF_WORK_STATUS_OPTIONS.map((o) => [o.key, o])),
  revoked: REVOKED_META
};

export const STAFF_WORK_STATUS_KEYS: StaffWorkStatus[] = [
  'available',
  'cleaning',
  'break',
  'outside',
  'off_duty',
  'revoked'
];

export function isStaffWorkStatus(v: unknown): v is StaffWorkStatus {
  return typeof v === 'string' && (STAFF_WORK_STATUS_KEYS as string[]).includes(v);
}

export function normalizeStaffWorkStatus(v: unknown): StaffWorkStatus {
  return isStaffWorkStatus(v) ? v : 'available';
}

export function staffWorkStatusMeta(v: unknown): StaffWorkStatusOption {
  return BY_KEY[normalizeStaffWorkStatus(v)] ?? STAFF_WORK_STATUS_OPTIONS[0];
}

/** localStorage key for the staff device's own selected status (display only). */
export const STAFF_STATUS_STORAGE_KEY = 'autoflow_staff_work_status';

/** Broadcast channel used to nudge the admin panel to refetch on a status change. */
export const STAFF_STATUS_CHANNEL = 'autoflow-staff-status';
export const STAFF_STATUS_EVENT = 'staff-status';
