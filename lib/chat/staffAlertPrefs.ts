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
