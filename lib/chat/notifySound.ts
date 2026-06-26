// Notification sound selection for the PC /chat surface.
// The chosen key is persisted in localStorage and read by:
//   1) the web "테스트 재생" preview (HTMLAudio against /public/sounds/*),
//   2) the Tauri native bridge (notify-bridge.js), which forwards it to the
//      native_notify Rust command so the OS notification plays the matching WAV.
// This module does NOT touch the existing web notification gate/conditions.

export type NotifySoundKey = 'default' | 'bell' | 'beep' | 'mute';

export type NotifySoundOption = {
  key: NotifySoundKey;
  label: string;
  /** Public asset path for web preview. Empty for mute. */
  file: string;
};

export const NOTIFY_SOUND_OPTIONS: NotifySoundOption[] = [
  { key: 'default', label: '기본음', file: '/sounds/default.wav' },
  { key: 'bell', label: '큰 벨', file: '/sounds/bell.wav' },
  { key: 'beep', label: '짧은 삐', file: '/sounds/beep.wav' },
  { key: 'mute', label: '무음', file: '' }
];

// Shared with notify-bridge.js — keep the string in sync if changed.
export const NOTIFY_SOUND_STORAGE_KEY = 'autoflow_notify_sound';

const DEFAULT_KEY: NotifySoundKey = 'default';

function isValidKey(v: unknown): v is NotifySoundKey {
  return v === 'default' || v === 'bell' || v === 'beep' || v === 'mute';
}

export function getNotifySoundKey(): NotifySoundKey {
  if (typeof window === 'undefined') return DEFAULT_KEY;
  try {
    const v = window.localStorage.getItem(NOTIFY_SOUND_STORAGE_KEY);
    return isValidKey(v) ? v : DEFAULT_KEY;
  } catch {
    return DEFAULT_KEY;
  }
}

export function setNotifySoundKey(key: NotifySoundKey): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(NOTIFY_SOUND_STORAGE_KEY, key);
  } catch {
    /* ignore */
  }
}

export function notifySoundOption(key: NotifySoundKey): NotifySoundOption {
  return NOTIFY_SOUND_OPTIONS.find((o) => o.key === key) ?? NOTIFY_SOUND_OPTIONS[0];
}

/** Web preview playback (used by the "테스트 재생" button in a plain browser). */
export function playNotifySoundPreview(key: NotifySoundKey): void {
  if (typeof window === 'undefined') return;
  const opt = notifySoundOption(key);
  if (!opt.file) return; // mute
  try {
    const audio = new Audio(opt.file);
    audio.volume = 1;
    void audio.play().catch(() => {});
  } catch {
    /* ignore */
  }
}
