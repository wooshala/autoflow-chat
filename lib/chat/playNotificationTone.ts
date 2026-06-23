import type { NotificationTone } from '@/lib/chat/notificationTone';

let audioUnlocked = false;

export function unlockNotificationAudio() {
  audioUnlocked = true;
}

export function isNotificationAudioUnlocked() {
  return audioUnlocked;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function beep(ctx: AudioContext, frequency: number, durationMs: number, gainValue = 0.03) {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();

  oscillator.type = 'sine';
  oscillator.frequency.value = frequency;

  const t = ctx.currentTime;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(gainValue, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.03, durationMs / 1000));

  oscillator.connect(gain);
  gain.connect(ctx.destination);

  oscillator.start();
  await sleep(durationMs);
  try {
    oscillator.stop();
  } catch {
    /* ignore */
  }
}

export async function playNotificationTone(tone: NotificationTone): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (tone === 'silent') return false;
  // In hidden/inactive state, in-app beep is not treated as primary alert.
  if (typeof document !== 'undefined' && (document.hidden || document.visibilityState !== 'visible')) return false;
  // Background-like: visible but unfocused should not be relied on.
  if (typeof document !== 'undefined' && typeof document.hasFocus === 'function' && !document.hasFocus()) return false;
  if (!audioUnlocked) return false;

  try {
    const AudioCtx =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return false;

    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {
        // continue best-effort
      }
    }

    switch (tone) {
      case 'urgent':
        await beep(ctx, 880, 110, 0.06);
        await sleep(70);
        await beep(ctx, 880, 110, 0.06);
        await sleep(70);
        await beep(ctx, 990, 140, 0.06);
        break;
      case 'warn':
        await beep(ctx, 440, 140, 0.05);
        await sleep(90);
        await beep(ctx, 520, 140, 0.05);
        break;
      case 'info':
        await beep(ctx, 660, 120, 0.04);
        await sleep(60);
        await beep(ctx, 760, 100, 0.04);
        break;
      case 'soft':
        await beep(ctx, 700, 80, 0.025);
        break;
      default:
        break;
    }

    setTimeout(() => {
      try {
        void ctx.close();
      } catch {
        /* ignore */
      }
    }, 300);
    return true;
  } catch (error) {
    console.warn('[CHAT_SOUND_PLAY_FAILED]', error);
    return false;
  }
}

