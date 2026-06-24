import { STAFF_TTS_URL } from '@/lib/chatApi';

/** Minimal silent WAV — unlock mobile HTMLAudio autoplay on user gesture. */
const SILENT_WAV =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

let serverTtsUnlocked = false;
let unlockAudio: HTMLAudioElement | null = null;
let activeAudio: HTMLAudioElement | null = null;
let activeBlobUrl: string | null = null;
let lastStaffTtsClientError: string | null = null;

export function peekLastStaffTtsClientError(): string | null {
  return lastStaffTtsClientError;
}

function noteStaffTtsClientError(message: string | null) {
  lastStaffTtsClientError = message;
}

export function isServerStaffTtsUnlocked(): boolean {
  return serverTtsUnlocked;
}

export function resetServerStaffTtsUnlock() {
  serverTtsUnlocked = false;
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

  try {
    if (!unlockAudio) {
      unlockAudio = new Audio(SILENT_WAV);
      unlockAudio.volume = 0.001;
      unlockAudio.preload = 'auto';
    }
    unlockAudio.currentTime = 0;
    await unlockAudio.play();
    serverTtsUnlocked = true;
    noteStaffTtsClientError(null);
    console.log('[STAFF_SERVER_TTS_UNLOCK_OK]');
    return true;
  } catch (e: unknown) {
    serverTtsUnlocked = false;
    const error = e instanceof Error ? e.message : String(e);
    console.log('[STAFF_SERVER_TTS_UNLOCK_FAILED]', { error });
    noteStaffTtsClientError(`unlock_failed:${error}`);
    return false;
  }
}

export type PlayServerStaffTtsOptions = {
  /** Skip prior unlock check — caller is in a direct user gesture (manual 🔊 read). */
  fromUserGesture?: boolean;
};

/**
 * Fetch Russian TTS mp3 from server and play via HTMLAudioElement.
 */
export async function playServerStaffTts(
  text: string,
  locale: 'ru' = 'ru',
  options?: PlayServerStaffTtsOptions
): Promise<boolean> {
  const fromUserGesture = options?.fromUserGesture ?? false;
  const preview = String(text || '').trim().slice(0, 120);
  console.log('[STAFF_SERVER_TTS_CLIENT_START]', {
    preview: preview.slice(0, 80),
    locale,
    unlocked: serverTtsUnlocked,
    fromUserGesture
  });

  if (typeof window === 'undefined') return false;
  if (!serverTtsUnlocked && !fromUserGesture) {
    console.log('[STAFF_SERVER_TTS_CLIENT_BLOCKED]', { reason: 'not_unlocked' });
    noteStaffTtsClientError('not_unlocked');
    return false;
  }
  if (!preview) {
    console.log('[STAFF_SERVER_TTS_CLIENT_BLOCKED]', { reason: 'empty_text' });
    noteStaffTtsClientError('empty_text');
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
      noteStaffTtsClientError(err);
      return false;
    }

    const blob = await res.blob();
    if (!blob.size) {
      console.log('[STAFF_SERVER_TTS_CLIENT_FAILED]', { reason: 'empty_blob' });
      noteStaffTtsClientError('empty_blob');
      return false;
    }

    cleanupActiveAudio();
    const url = URL.createObjectURL(blob);
    activeBlobUrl = url;
    const audio = new Audio(url);
    activeAudio = audio;
    audio.onended = () => {
      console.log('[STAFF_SERVER_TTS_CLIENT_ENDED]', { preview: preview.slice(0, 80) });
    };

    try {
      await audio.play();
    } catch (playErr: unknown) {
      const error = playErr instanceof Error ? playErr.message : String(playErr);
      console.log('[STAFF_SERVER_TTS_AUDIO_PLAY_FAILED]', { error, fromUserGesture });
      noteStaffTtsClientError(`audio_play_failed:${error}`);
      cleanupActiveAudio();
      return false;
    }

    if (fromUserGesture) {
      serverTtsUnlocked = true;
    }

    console.log('[STAFF_SERVER_TTS_CLIENT_PLAYING]', {
      preview: preview.slice(0, 80),
      cache: res.headers.get('X-TTS-Cache')
    });
    noteStaffTtsClientError(null);
    return true;
  } catch (e: unknown) {
    const err = e instanceof Error ? e.message : String(e);
    console.log('[STAFF_SERVER_TTS_CLIENT_FAILED]', {
      error: err
    });
    noteStaffTtsClientError(err);
    cleanupActiveAudio();
    return false;
  }
}
