export const STAFF_DEVICE_KEY_STORAGE = 'autoflow_staff_device_key_v1';

export function getOrCreateStaffDeviceKey(): string {
  if (typeof window === 'undefined') return '';
  try {
    const existing = localStorage.getItem(STAFF_DEVICE_KEY_STORAGE)?.trim();
    if (existing) return existing;
    const key = `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(STAFF_DEVICE_KEY_STORAGE, key);
    return key;
  } catch {
    return `dev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }
}
