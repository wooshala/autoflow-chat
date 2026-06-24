import { STAFF_TTS_URL } from '@/lib/chatApi';

let serverTtsUnlocked = false;
let activeAudio: HTMLAudioElement | null = null;
let activeBlobUrl: string | null = null;
let lastStaffTtsClientError: string | null = null;

export function peekLastStaffTtsClientError(): string | null {
  return lastStaffTtsClientError;
}

function noteStaffTtsClientError(message: string | null) {
  lastStaffTtsClientError = message;
}

export function unlockServerStaffTts() {
  serverTtsUnlocked = true;
}

export function isServerStaffTtsUnlocked(): boolean {
  return serverTtsUnlocked;
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
 * Fetch Russian TTS mp3 from server and play via HTMLAudioElement.
 * Requires unlockServerStaffTts() after a user gesture (same as Web Speech).
 */
export async function playServerStaffTts(text: string, locale: 'ru' = 'ru'): Promise<boolean> {
  const preview = String(text || '').trim().slice(0, 120);
  console.log('[STAFF_SERVER_TTS_CLIENT_START]', {
    preview: preview.slice(0, 80),
    locale,
    unlocked: serverTtsUnlocked
  });

  if (typeof window === 'undefined') return false;
  if (!serverTtsUnlocked) {
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
    await audio.play();
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
