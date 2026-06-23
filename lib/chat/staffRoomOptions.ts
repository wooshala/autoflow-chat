export const STAFF_CURRENT_ROOM_STORAGE_KEY = 'autoflow_staff_current_room_v1';

/** 운영 객실 — 고정 순서 */
export const STAFF_ROOM_OPTIONS = [
  '201', '202', '203', '205', '206', '207', '208', '209',
  '301', '302', '303', '305', '306', '307', '308', '309',
  '501', '502', '503', '505', '506', '507', '508',
  '601', '602', '603', '605', '606', '607', '608',
  '701', '702', '703', '705', '706', '707', '708',
  '801', '802'
] as const;

export const STAFF_VALID_ROOM_SET = new Set<string>(STAFF_ROOM_OPTIONS);

export function loadStaffStoredRoom(): string {
  if (typeof window === 'undefined') return '';
  try {
    const r = String(localStorage.getItem(STAFF_CURRENT_ROOM_STORAGE_KEY) || '').trim();
    return STAFF_VALID_ROOM_SET.has(r) ? r : '';
  } catch {
    return '';
  }
}

export function saveStaffStoredRoom(roomNo: string) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STAFF_CURRENT_ROOM_STORAGE_KEY, roomNo);
  } catch {
    // ignore
  }
}
