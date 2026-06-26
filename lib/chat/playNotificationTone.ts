import type { NotificationTone } from '@/lib/chat/notificationTone';
import { getNotifySoundKey } from '@/lib/chat/notifySound';
import { NOTIFY_PLAY_VOLUME, playPreferredNotifySound } from '@/lib/chat/notifySoundPlay';

/** Minimal silent WAV — unlock HTMLAudio autoplay on user gesture (fallback). */
const SILENT_WAV =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

/** Legacy unlock target — kept for autoplay unlock gesture compatibility. */
const NOTIFY_SOUND_SRC = '/sounds/notify.mp3';

/** Unlock test beep — keep quiet. */
const UNLOCK_BEEP_GAIN = 0.002;
const UNLOCK_BEEP_DURATION_MS = 40;

/** Oscillator fallback when file/synth preference playback fails. */
export const NOTIFY_BEEP_GAIN = NOTIFY_PLAY_VOLUME;
export const NOTIFY_BEEP_DURATION_MS = 180;
export const NOTIFY_BEEP_GAP_MS = 80;
const NOTIFY_BEEP_REPEATS_DEFAULT = 2;
const NOTIFY_BEEP_REPEATS_URGENT = 3;

let audioUnlocked = false;
let sharedCtx: AudioContext | null = null;
let unlockAudio: HTMLAudioElement | null = null;
let notifyAudio: HTMLAudioElement | null = null;

const unlockListeners = new Set<() => void>();

function notifyUnlockListeners() {
  for (const fn of unlockListeners) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
}

function getAudioContextCtor(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null;
  return (
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ||
    null
  );
}

function playErrorFields(err: unknown): { errorName: string; errorMessage: string } {
  if (err instanceof Error) {
    return { errorName: err.name, errorMessage: err.message };
  }
  return { errorName: 'unknown', errorMessage: String(err) };
}

/** Single reusable HTMLAudioElement for the real notification sound (autoplay-friendly). */
function getNotifyAudio(): HTMLAudioElement | null {
  if (typeof window === 'undefined') return null;
  if (!notifyAudio) {
    notifyAudio = new Audio(NOTIFY_SOUND_SRC);
    notifyAudio.preload = 'auto';
  }
  return notifyAudio;
}

/** Play the real notification sound file at full volume. Primary playback path. */
async function playNotifyAudioFile(): Promise<boolean> {
  const audio = getNotifyAudio();
  if (!audio) return false;
  try {
    audio.volume = NOTIFY_PLAY_VOLUME;
    audio.currentTime = 0;
    await audio.play();
    console.log('[CHAT_SOUND_AUDIO_FILE_PLAY_OK]', { src: NOTIFY_SOUND_SRC, volume: audio.volume });
    return true;
  } catch (err: unknown) {
    console.log('[CHAT_SOUND_AUDIO_FILE_PLAY_FAILED]', { src: NOTIFY_SOUND_SRC, ...playErrorFields(err) });
    return false;
  }
}

/** Unlock the notify.mp3 element inside a user gesture: volume=0 play → pause. */
async function unlockViaNotifyAudioFile(): Promise<boolean> {
  const audio = getNotifyAudio();
  if (!audio) return false;
  try {
    audio.volume = 0;
    audio.currentTime = 0;
    await audio.play();
    audio.pause();
    audio.currentTime = 0;
    return true;
  } catch (err: unknown) {
    console.log('[CHAT_SOUND_UNLOCK_FAILED]', { method: 'audio_file', ...playErrorFields(err) });
    return false;
  }
}

export function isNotificationAudioUnlocked(): boolean {
  return audioUnlocked;
}

export function peekNotificationAudioDiag(): {
  audioUnlocked: boolean;
  ctxState: AudioContextState | null;
  hasSharedCtx: boolean;
} {
  return {
    audioUnlocked,
    ctxState: sharedCtx?.state ?? null,
    hasSharedCtx: Boolean(sharedCtx)
  };
}

export function subscribeNotificationAudioUnlock(listener: () => void): () => void {
  unlockListeners.add(listener);
  return () => unlockListeners.delete(listener);
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function beep(
  ctx: AudioContext,
  frequency: number,
  durationMs: number,
  gainValue: number,
  logMeta?: Record<string, unknown>
) {
  if (logMeta) {
    console.log('[CHAT_SOUND_BEEP]', { frequency, durationMs, gain: gainValue, ...logMeta });
  }

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

async function playMessageNotificationBeeps(ctx: AudioContext, tone: NotificationTone) {
  const gain = NOTIFY_BEEP_GAIN;
  const durationMs = NOTIFY_BEEP_DURATION_MS;
  const gapMs = NOTIFY_BEEP_GAP_MS;

  let repeats = NOTIFY_BEEP_REPEATS_DEFAULT;
  let frequency = 660;

  switch (tone) {
    case 'urgent':
      repeats = NOTIFY_BEEP_REPEATS_URGENT;
      frequency = 880;
      break;
    case 'warn':
      frequency = 520;
      break;
    case 'soft':
      frequency = 700;
      break;
    case 'info':
    default:
      frequency = 660;
      break;
  }

  console.log('[CHAT_SOUND_NOTIFY_PATTERN]', {
    tone,
    gain,
    durationMs,
    repeats,
    frequency
  });

  for (let i = 0; i < repeats; i++) {
    await beep(ctx, frequency, durationMs, gain, {
      kind: 'notification',
      tone,
      repeat: i + 1,
      of: repeats
    });
    if (i < repeats - 1) {
      await sleep(gapMs);
    }
  }
}

async function unlockViaHtmlAudio(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  try {
    if (!unlockAudio) {
      unlockAudio = new Audio(SILENT_WAV);
      unlockAudio.volume = 0.001;
      unlockAudio.preload = 'auto';
    }
    unlockAudio.currentTime = 0;
    await unlockAudio.play();
    console.log('[CHAT_SOUND_UNLOCK_OK]', { method: 'html_audio_silent', volume: unlockAudio.volume });
    return true;
  } catch (err: unknown) {
    console.log('[CHAT_SOUND_UNLOCK_HTML_FAILED]', playErrorFields(err));
    return false;
  }
}

/**
 * Call inside a user gesture (tap, click, 🔊 ON).
 * Creates/resumes singleton AudioContext and plays a tiny beep.
 */
export async function unlockNotificationAudio(): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  // Primary: unlock the real notify.mp3 element (the actual playback path).
  const fileUnlocked = await unlockViaNotifyAudioFile();
  if (fileUnlocked) {
    audioUnlocked = true;
    notifyUnlockListeners();
    console.log('[CHAT_SOUND_UNLOCK_OK]', { method: 'audio_file' });
  }

  // Best-effort: also prepare the WebAudio oscillator fallback within the same gesture.
  const AudioCtx = getAudioContextCtor();
  if (!AudioCtx) {
    if (fileUnlocked) return true;
    console.log('[CHAT_SOUND_UNLOCK_FAILED]', { reason: 'no_audio_context_ctor' });
    const htmlOk = await unlockViaHtmlAudio();
    if (htmlOk) {
      audioUnlocked = true;
      notifyUnlockListeners();
    }
    return htmlOk;
  }

  if (!sharedCtx) {
    sharedCtx = new AudioCtx();
  }

  const stateBefore = sharedCtx.state;
  console.log('[CHAT_SOUND_UNLOCK_START]', { stateBefore, diag: peekNotificationAudioDiag() });

  try {
    if (sharedCtx.state === 'suspended') {
      await sharedCtx.resume();
    }
    const stateAfterResume = sharedCtx.state;
    console.log('[CHAT_SOUND_UNLOCK_RESUME]', { stateBefore, stateAfterResume });

    if (stateAfterResume !== 'running') {
      const htmlOk = await unlockViaHtmlAudio();
      if (!htmlOk) {
        console.log('[CHAT_SOUND_UNLOCK_FAILED]', {
          reason: 'ctx_not_running',
          stateBefore,
          stateAfterResume
        });
        return fileUnlocked;
      }
    }

    await beep(sharedCtx, 440, UNLOCK_BEEP_DURATION_MS, UNLOCK_BEEP_GAIN, { kind: 'unlock_test' });

    audioUnlocked = true;
    notifyUnlockListeners();
    console.log('[CHAT_SOUND_UNLOCK_OK]', {
      method: 'web_audio_beep',
      state: sharedCtx.state,
      unlockGain: UNLOCK_BEEP_GAIN
    });
    return true;
  } catch (err: unknown) {
    console.log('[CHAT_SOUND_UNLOCK_FAILED]', {
      stateBefore,
      stateAfter: sharedCtx.state,
      ...playErrorFields(err)
    });
    const htmlOk = await unlockViaHtmlAudio();
    if (htmlOk) {
      audioUnlocked = true;
      notifyUnlockListeners();
      return true;
    }
    return fileUnlocked;
  }
}

export type PlayNotificationToneOptions = {
  /** Best-effort beep when tab hidden (often blocked; OS notification sound is primary). */
  allowHidden?: boolean;
};

export async function playNotificationTone(
  tone: NotificationTone,
  options?: PlayNotificationToneOptions
): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (tone === 'silent') return false;

  const hidden =
    typeof document !== 'undefined' &&
    (document.hidden || document.visibilityState !== 'visible');
  if (hidden && !options?.allowHidden) {
    console.log('[CHAT_SOUND_SKIPPED]', { reason: 'not_visible', tone });
    return false;
  }

  const diag = peekNotificationAudioDiag();
  if (!audioUnlocked) {
    console.log('[CHAT_SOUND_SKIPPED]', { reason: 'not_unlocked', tone, hidden, diag });
    return false;
  }

  if (getNotifySoundKey() === 'mute') {
    console.log('[CHAT_SOUND_SKIPPED]', { reason: 'notify_sound_mute', tone });
    return false;
  }

  // Primary: user-selected notification sound (file or soft synth profile).
  const prefOk = await playPreferredNotifySound({ tone, volume: NOTIFY_PLAY_VOLUME, audioContext: sharedCtx });
  if (prefOk) return true;

  // Legacy file fallback if preference playback failed.
  const fileOk = await playNotifyAudioFile();
  if (fileOk) return true;

  // Fallback only: WebAudio oscillator beeps.
  if (!sharedCtx) {
    console.log('[CHAT_SOUND_SKIPPED]', { reason: 'no_fallback_ctx', tone, hidden, diag });
    return false;
  }

  const ctx = sharedCtx;
  const stateBefore = ctx.state;
  console.log('[CHAT_SOUND_PLAY]', {
    tone,
    stateBefore,
    hidden,
    allowHidden: Boolean(options?.allowHidden),
    notifyGain: NOTIFY_BEEP_GAIN,
    diag
  });

  try {
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch (resumeErr: unknown) {
        console.log('[CHAT_SOUND_PLAY_FAILED]', {
          phase: 'resume',
          tone,
          stateBefore,
          stateAfter: ctx.state,
          ...playErrorFields(resumeErr)
        });
        return false;
      }
    }

    const stateAfterResume = ctx.state;
    console.log('[CHAT_SOUND_PLAY_CTX]', { tone, stateBefore, stateAfterResume, notifyGain: NOTIFY_BEEP_GAIN });

    if (stateAfterResume !== 'running') {
      console.log('[CHAT_SOUND_PLAY_FAILED]', {
        phase: 'ctx_not_running',
        tone,
        stateBefore,
        stateAfterResume
      });
      return false;
    }

    await playMessageNotificationBeeps(ctx, tone);

    console.log('[CHAT_SOUND_PLAY_OK]', { tone, state: ctx.state, notifyGain: NOTIFY_BEEP_GAIN });
    return true;
  } catch (error: unknown) {
    console.log('[CHAT_SOUND_PLAY_FAILED]', {
      phase: 'beep',
      tone,
      stateBefore,
      stateAfter: ctx.state,
      notifyGain: NOTIFY_BEEP_GAIN,
      ...playErrorFields(error)
    });
    return false;
  }
}
