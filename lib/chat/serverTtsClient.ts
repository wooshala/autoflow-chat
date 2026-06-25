import { STAFF_TTS_URL } from '@/lib/chatApi';
import {
  isServerTtsLangSupported,
  type StaffTtsLang
} from '@/lib/chat/staffTtsLang';
import {
  normalizeStaffTtsPlayError,
  peekStaffTtsDiag,
  peekStaffTtsError,
  setStaffTtsError,
  setStaffTtsStage,
  subscribeStaffTtsDiag
} from '@/lib/chat/staffTtsDiagState';

export type { StaffTtsStage } from '@/lib/chat/staffTtsDiagState';
export {
  noteStaffTtsMessageReceived,
  peekStaffTtsDiag,
  peekStaffTtsError,
  peekStaffTtsStage,
  subscribeStaffTtsDiag
} from '@/lib/chat/staffTtsDiagState';

/** Minimal silent WAV — unlock mobile HTMLAudio autoplay on user gesture. */
const SILENT_WAV =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

const STORAGE_SERVER_TTS_ARMED = 'autoflow_staff_server_tts_armed_v1';

let serverTtsUnlocked = false;
let unlockAudio: HTMLAudioElement | null = null;
let activeAudio: HTMLAudioElement | null = null;
let activeBlobUrl: string | null = null;

export function subscribeStaffTtsUnlockState(listener: () => void): () => void {
  return subscribeStaffTtsDiag(listener);
}

export function peekLastStaffTtsClientError(): string | null {
  const err = peekStaffTtsError();
  return err === 'none' ? null : err;
}

export function isServerStaffTtsUnlocked(): boolean {
  return serverTtsUnlocked;
}

/** Sync arm on user gesture — matches unlockNotificationAudio() pattern. */
export function armServerStaffTtsUnlock(): void {
  if (typeof window === 'undefined') return;
  serverTtsUnlocked = true;
  try {
    sessionStorage.setItem(STORAGE_SERVER_TTS_ARMED, '1');
  } catch {
    /* ignore */
  }
  setStaffTtsError('none');
  console.log('[STAFF_SERVER_TTS_ARMED]', { method: 'sync_flag' });
}

/** Restore arm for this browser tab when sound was left ON. */
export function hydrateServerStaffTtsUnlockFromStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    if (sessionStorage.getItem(STORAGE_SERVER_TTS_ARMED) === '1') {
      serverTtsUnlocked = true;
      console.log('[STAFF_SERVER_TTS_ARMED]', { method: 'session_storage_hydrate' });
    }
  } catch {
    /* ignore */
  }
}

export function resetServerStaffTtsUnlock() {
  serverTtsUnlocked = false;
  try {
    sessionStorage.removeItem(STORAGE_SERVER_TTS_ARMED);
  } catch {
    /* ignore */
  }
}

async function unlockViaAudioContext(): Promise<boolean> {
  const AudioCtx =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return false;
  const ctx = new AudioCtx();
  if (ctx.state === 'suspended') {
    await ctx.resume();
  }
  const buffer = ctx.createBuffer(1, 1, 22050);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.start(0);
  window.setTimeout(() => {
    try {
      void ctx.close();
    } catch {
      /* ignore */
    }
  }, 100);
  return true;
}

function cleanupActiveAudio() {
  if (activeAudio) {
    activeAudio.pause();
    activeAudio.src = '';
    activeAudio = null;
  }
  if (activeBlobUrl) {
    URL.revokeObjectURL(activeBlobUrl);
    activeBlobUrl = null;
  }
}

/**
 * Call synchronously inside a user gesture (e.g. 🔊 ON click).
 * Plays silent audio to satisfy mobile autoplay policy.
 */
export async function unlockServerStaffTts(): Promise<boolean> {
  console.log('[STAFF_SERVER_TTS_UNLOCK_START]');
  if (typeof window === 'undefined') {
    console.log('[STAFF_SERVER_TTS_UNLOCK_FAILED]', { reason: 'no_window' });
    return false;
  }

  // User-gesture entry: arm immediately (notification unlock uses the same pattern).
  armServerStaffTtsUnlock();

  try {
    if (!unlockAudio) {
      unlockAudio = new Audio(SILENT_WAV);
      unlockAudio.volume = 0.001;
      unlockAudio.preload = 'auto';
    }
    unlockAudio.currentTime = 0;
    await unlockAudio.play();
    console.log('[STAFF_SERVER_TTS_UNLOCK_OK]', { method: 'silent_audio' });
    return true;
  } catch (audioErr: unknown) {
    const audioError = audioErr instanceof Error ? audioErr.message : String(audioErr);
    console.log('[STAFF_SERVER_TTS_UNLOCK_RETRY]', { method: 'audio_context', audioError });
    try {
      await unlockViaAudioContext();
      console.log('[STAFF_SERVER_TTS_UNLOCK_OK]', { method: 'audio_context' });
      return true;
    } catch (ctxErr: unknown) {
      const error = ctxErr instanceof Error ? ctxErr.message : String(ctxErr);
      console.log('[STAFF_SERVER_TTS_UNLOCK_AUDIO_FAILED]', { audioError, error, armed: true });
      setStaffTtsError(`unlock_audio_failed:${error}`);
      // Keep serverTtsUnlocked=true — gate passes; mp3 play may still need gesture.
      return true;
    }
  }
}

export type PlayServerStaffTtsOptions = {
  /** Skip prior unlock check — caller is in a direct user gesture (manual 🔊 read). */
  fromUserGesture?: boolean;
};

/**
 * Fetch TTS mp3 from server and play via HTMLAudioElement.
 */
export async function playServerStaffTts(
  text: string,
  locale: StaffTtsLang,
  options?: PlayServerStaffTtsOptions
): Promise<boolean> {
  const fromUserGesture = options?.fromUserGesture ?? false;
  const preview = String(text || '').trim().slice(0, 120);
  setStaffTtsStage('tts_requested');

  console.log('[STAFF_SERVER_TTS_CLIENT_START]', {
    preview: preview.slice(0, 80),
    locale,
    unlocked: serverTtsUnlocked,
    fromUserGesture,
    diag: peekStaffTtsDiag()
  });

  if (typeof window === 'undefined') return false;
  if (!isServerTtsLangSupported(locale)) {
    console.log('[STAFF_SERVER_TTS_CLIENT_BLOCKED]', { reason: 'unsupported_locale', locale });
    setStaffTtsError('skip_tts_lang_unsupported');
    return false;
  }
  if (!serverTtsUnlocked && !fromUserGesture) {
    console.log('[STAFF_SERVER_TTS_CLIENT_BLOCKED]', { reason: 'not_unlocked' });
    setStaffTtsError('not_unlocked');
    return false;
  }
  if (!preview) {
    console.log('[STAFF_SERVER_TTS_CLIENT_BLOCKED]', { reason: 'empty_text' });
    setStaffTtsError('empty_text');
    return false;
  }

  try {
    const res = await fetch(STAFF_TTS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: preview, locale })
    });

    if (!res.ok) {
      const err = `http_${res.status}`;
      console.log('[STAFF_SERVER_TTS_CLIENT_FAILED]', {
        status: res.status,
        cache: res.headers.get('X-TTS-Cache')
      });
      setStaffTtsError(err);
      return false;
    }

    const blob = await res.blob();
    if (!blob.size) {
      console.log('[STAFF_SERVER_TTS_CLIENT_FAILED]', { reason: 'empty_blob' });
      setStaffTtsError('empty_blob');
      return false;
    }

    setStaffTtsStage('tts_response_received');

    cleanupActiveAudio();
    const url = URL.createObjectURL(blob);
    activeBlobUrl = url;
    const audio = new Audio(url);
    activeAudio = audio;
    audio.onended = () => {
      setStaffTtsStage('audio_play_ended');
      console.log('[STAFF_SERVER_TTS_CLIENT_ENDED]', { preview: preview.slice(0, 80) });
    };

    try {
      await audio.play();
      setStaffTtsStage('audio_play_started');
      setStaffTtsError('none');
    } catch (playErr: unknown) {
      const error = normalizeStaffTtsPlayError(playErr);
      console.log('[STAFF_SERVER_TTS_AUDIO_PLAY_FAILED]', { error, fromUserGesture });
      setStaffTtsStage('audio_play_failed');
      setStaffTtsError(error);
      cleanupActiveAudio();
      return false;
    }

    if (fromUserGesture) {
      serverTtsUnlocked = true;
    }

    console.log('[STAFF_SERVER_TTS_CLIENT_PLAYING]', {
      preview: preview.slice(0, 80),
      cache: res.headers.get('X-TTS-Cache'),
      diag: peekStaffTtsDiag()
    });
    return true;
  } catch (e: unknown) {
    const err = e instanceof Error ? e.message : String(e);
    console.log('[STAFF_SERVER_TTS_CLIENT_FAILED]', {
      error: err
    });
    setStaffTtsError(err);
    cleanupActiveAudio();
    return false;
  }
}
