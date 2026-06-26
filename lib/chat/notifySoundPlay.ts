import type { NotificationTone } from '@/lib/chat/notificationTone';
import {
  getNotifySoundKey,
  notifySoundOption,
  type NotifySoundKey
} from '@/lib/chat/notifySound';
import { playNotifySynthProfile } from '@/lib/chat/notifySoundSynth';

/** Softer default playback level for in-app notification sounds. */
export const NOTIFY_PLAY_VOLUME = 0.42;

function getAudioContextCtor(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null;
  return (
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ||
    null
  );
}

async function playFile(src: string, volume: number): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  try {
    const audio = new Audio(src);
    audio.volume = Math.min(1, Math.max(0, volume));
    audio.currentTime = 0;
    await audio.play();
    return true;
  } catch {
    return false;
  }
}

/** Urgent tones replay once for emphasis — still within notify pipeline. */
function repeatForTone(tone: NotificationTone): number {
  return tone === 'urgent' ? 2 : 1;
}

export async function playNotifySoundForKey(
  key: NotifySoundKey,
  options?: { tone?: NotificationTone; volume?: number; audioContext?: AudioContext | null }
): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const opt = notifySoundOption(key);
  if (opt.kind === 'mute') return false;

  const volume = options?.volume ?? NOTIFY_PLAY_VOLUME;
  const tone = options?.tone ?? 'info';
  const repeats = repeatForTone(tone);

  for (let i = 0; i < repeats; i++) {
    let ok = false;
    if (opt.kind === 'file' && opt.file) {
      ok = await playFile(opt.file, volume);
    } else if (opt.kind === 'synth' && opt.synth) {
      const Ctor = getAudioContextCtor();
      if (Ctor) {
        const ctx = options?.audioContext ?? new Ctor();
        try {
          await playNotifySynthProfile(ctx, opt.synth, volume);
          ok = true;
        } catch {
          ok = false;
        }
        if (!options?.audioContext && ctx.state !== 'closed') {
          try {
            await ctx.close();
          } catch {
            /* ignore */
          }
        }
      }
    }
    if (!ok) return false;
    if (i < repeats - 1) {
      await new Promise((r) => setTimeout(r, 120));
    }
  }
  return true;
}

/** Play the user-selected notification sound (preview button + pipeline mapping). */
export async function playNotifySoundPreview(key?: NotifySoundKey): Promise<boolean> {
  const k = key ?? getNotifySoundKey();
  return playNotifySoundForKey(k, { tone: 'info', volume: NOTIFY_PLAY_VOLUME });
}

/** Notify pipeline entry: read preference and play without changing gate conditions. */
export async function playPreferredNotifySound(options?: {
  tone?: NotificationTone;
  volume?: number;
  audioContext?: AudioContext | null;
}): Promise<boolean> {
  return playNotifySoundForKey(getNotifySoundKey(), options);
}
