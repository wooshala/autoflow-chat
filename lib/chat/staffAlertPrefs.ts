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
