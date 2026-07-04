const STORAGE_ALERTS_ENABLED = 'autoflow_staff_sound_enabled_v1';
const STORAGE_AUTO_TTS_ENABLED = 'autoflow_staff_auto_tts_enabled_v1';

/** P0: toast + beep — default ON for new installs. */
export function loadStaffAlertsEnabled(): boolean {
  try {
    const v = localStorage.getItem(STORAGE_ALERTS_ENABLED);
    if (v === null) return true;
    return v === '1' || v === 'true';
  } catch {
    return true;
  }
}

export function saveStaffAlertsEnabled(enabled: boolean) {
  try {
    localStorage.setItem(STORAGE_ALERTS_ENABLED, enabled ? '1' : '0');
  } catch {
    /* ignore */
  }
}

/** Optional: foreground auto TTS — default OFF (P0 is alerts only). */
export function loadStaffAutoTtsEnabled(): boolean {
  try {
    const v = localStorage.getItem(STORAGE_AUTO_TTS_ENABLED);
    if (v === null) return false;
    return v === '1' || v === 'true';
  } catch {
    return false;
  }
}

export function saveStaffAutoTtsEnabled(enabled: boolean) {
  try {
    localStorage.setItem(STORAGE_AUTO_TTS_ENABLED, enabled ? '1' : '0');
  } catch {
    /* ignore */
  }
}

const STORAGE_ALERT_SOUND_KEY = 'autoflow_staff_alert_sound_key_v1';
const DEFAULT_STAFF_SOUND_KEY = 'default';

export type StaffSoundKey =
  | 'default'
  | 'bell'
  | 'incoming'
  | 'notify-022'
  | 'notify-036'
  | 'notify-053';

export const STAFF_SOUND_OPTIONS: { key: StaffSoundKey; label: string; src: string }[] = [
  { key: 'default', label: '기본음', src: '/sounds/default.wav' },
  { key: 'bell', label: '벨', src: '/sounds/bell.wav' },
  { key: 'incoming', label: '수신음', src: '/sounds/incoming.mp3' },
  { key: 'notify-022', label: '알림 1', src: '/sounds/notify-022.mp3' },
  { key: 'notify-036', label: '알림 2', src: '/sounds/notify-036.mp3' },
  { key: 'notify-053', label: '알림 3', src: '/sounds/notify-053.mp3' },
];

const STAFF_SOUND_KEY_SET = new Set<string>(STAFF_SOUND_OPTIONS.map((o) => o.key));

export function isValidStaffSoundKey(k: string): k is StaffSoundKey {
  return STAFF_SOUND_KEY_SET.has(k);
}

export function staffSoundSrc(key: StaffSoundKey): string {
  return STAFF_SOUND_OPTIONS.find((o) => o.key === key)?.src ?? '/sounds/default.wav';
}

export function loadStaffSoundKey(): StaffSoundKey {
  try {
    const v = localStorage.getItem(STORAGE_ALERT_SOUND_KEY);
    if (v && isValidStaffSoundKey(v)) return v;
    return DEFAULT_STAFF_SOUND_KEY;
  } catch {
    return DEFAULT_STAFF_SOUND_KEY;
  }
}

export function saveStaffSoundKey(key: StaffSoundKey) {
  try {
    localStorage.setItem(STORAGE_ALERT_SOUND_KEY, key);
  } catch {
    /* ignore */
  }
}

const STORAGE_ALERT_VOLUME = 'autoflow_staff_alert_volume_v1';
const DEFAULT_STAFF_ALERT_VOLUME = 0.6;

export function loadStaffAlertVolume(): number {
  try {
    const v = localStorage.getItem(STORAGE_ALERT_VOLUME);
    if (v === null) return DEFAULT_STAFF_ALERT_VOLUME;
    const n = parseFloat(v);
    if (!Number.isFinite(n)) return DEFAULT_STAFF_ALERT_VOLUME;
    return Math.min(1, Math.max(0, n));
  } catch {
    return DEFAULT_STAFF_ALERT_VOLUME;
  }
}

export function saveStaffAlertVolume(volume: number) {
  try {
    localStorage.setItem(STORAGE_ALERT_VOLUME, String(Math.min(1, Math.max(0, volume))));
  } catch {
    /* ignore */
  }
}
