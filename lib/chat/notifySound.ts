// Notification sound selection for the PC /chat surface.
// Persisted key is read by web preview, playNotificationTone mapping, and Tauri bridge.

import type { NotifySynthProfile } from '@/lib/chat/notifySoundSynth';

export type NotifySoundKey =
  | 'default'
  | 'soft-chime'
  | 'bell'
  | 'beep'
  | 'ding'
  | 'pop'
  | 'glass'
  | 'water-drop'
  | 'office-soft'
  | 'digital-soft'
  | 'knock'
  | 'incoming'
  | 'notify-022'
  | 'notify-036'
  | 'notify-053'
  | 'mute';

export type NotifySoundKind = 'file' | 'synth' | 'mute';

export type NotifySoundOption = {
  key: NotifySoundKey;
  label: string;
  kind: NotifySoundKind;
  file?: string;
  synth?: NotifySynthProfile;
};

export const NOTIFY_SOUND_OPTIONS: NotifySoundOption[] = [
  { key: 'default', label: '기본음 (부드러운 차임)', kind: 'synth', synth: 'soft-chime' },
  { key: 'soft-chime', label: '소프트 차임', kind: 'synth', synth: 'soft-chime' },
  { key: 'bell', label: '벨', kind: 'file', file: '/sounds/bell.wav' },
  { key: 'beep', label: '짧은 삐', kind: 'file', file: '/sounds/beep.wav' },
  { key: 'ding', label: '딩', kind: 'synth', synth: 'ding' },
  { key: 'pop', label: '팝', kind: 'synth', synth: 'pop' },
  { key: 'glass', label: '글래스', kind: 'synth', synth: 'glass' },
  { key: 'water-drop', label: '물방울', kind: 'synth', synth: 'water-drop' },
  { key: 'office-soft', label: '오피스 (부드럽게)', kind: 'synth', synth: 'office-soft' },
  { key: 'digital-soft', label: '디지털 (부드럽게)', kind: 'synth', synth: 'digital-soft' },
  { key: 'knock', label: '노크', kind: 'synth', synth: 'knock' },
  { key: 'incoming', label: '인커밍 (MP3)', kind: 'file', file: '/sounds/incoming.mp3' },
  { key: 'notify-022', label: '뉴 알림 022 (MP3)', kind: 'file', file: '/sounds/notify-022.mp3' },
  { key: 'notify-036', label: '뉴 알림 036 (MP3)', kind: 'file', file: '/sounds/notify-036.mp3' },
  { key: 'notify-053', label: '뉴 알림 053 (MP3)', kind: 'file', file: '/sounds/notify-053.mp3' },
  { key: 'mute', label: '무음', kind: 'mute' }
];

/** Shared with notify-bridge.js — keep the string in sync if changed. */
export const NOTIFY_SOUND_STORAGE_KEY = 'autoflow_notify_sound';

const FALLBACK_KEY: NotifySoundKey = 'soft-chime';

const VALID_KEYS = new Set<NotifySoundKey>(NOTIFY_SOUND_OPTIONS.map((o) => o.key));

export function normalizeNotifySoundKey(raw: unknown): NotifySoundKey {
  const v = String(raw ?? '').trim();
  if (VALID_KEYS.has(v as NotifySoundKey)) return v as NotifySoundKey;
  return FALLBACK_KEY;
}

export function getNotifySoundKey(): NotifySoundKey {
  if (typeof window === 'undefined') return FALLBACK_KEY;
  try {
    const v = window.localStorage.getItem(NOTIFY_SOUND_STORAGE_KEY);
    return normalizeNotifySoundKey(v);
  } catch {
    return FALLBACK_KEY;
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
  const normalized = normalizeNotifySoundKey(key);
  return (
    NOTIFY_SOUND_OPTIONS.find((o) => o.key === normalized) ??
    NOTIFY_SOUND_OPTIONS.find((o) => o.key === 'soft-chime')!
  );
}
