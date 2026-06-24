export type StaffTtsStage =
  | 'idle'
  | 'message_received'
  | 'tts_requested'
  | 'tts_response_received'
  | 'audio_play_started'
  | 'audio_play_ended'
  | 'audio_play_failed';

let lastTtsStage: StaffTtsStage = 'idle';
let lastTtsError = 'none';

const diagListeners = new Set<() => void>();

export function peekStaffTtsStage(): StaffTtsStage {
  return lastTtsStage;
}

export function peekStaffTtsError(): string {
  return lastTtsError;
}

export function peekStaffTtsDiag(): { lastTtsStage: StaffTtsStage; lastTtsError: string } {
  return { lastTtsStage, lastTtsError };
}

export function subscribeStaffTtsDiag(listener: () => void): () => void {
  diagListeners.add(listener);
  return () => diagListeners.delete(listener);
}

function notifyStaffTtsDiag() {
  for (const fn of diagListeners) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
}

export function setStaffTtsStage(stage: StaffTtsStage) {
  lastTtsStage = stage;
  notifyStaffTtsDiag();
}

export function setStaffTtsError(error: string) {
  lastTtsError = error || 'none';
  notifyStaffTtsDiag();
}

export function noteStaffTtsMessageReceived() {
  setStaffTtsStage('message_received');
}

/** Map DOM/play errors to diag codes; falls back to raw message. */
export function normalizeStaffTtsPlayError(err: unknown): string {
  if (err instanceof DOMException) {
    if (err.name === 'NotAllowedError') return 'not_allowed_error';
    if (err.name === 'AbortError') return 'abort_error';
    return err.message || err.name;
  }
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (msg.includes('notallowed') || msg.includes('not allowed')) return 'not_allowed_error';
    if (msg.includes('abort')) return 'abort_error';
    return err.message;
  }
  return String(err);
}

/** @deprecated use peekStaffTtsError */
export function peekLastStaffTtsClientError(): string | null {
  return lastTtsError === 'none' ? null : lastTtsError;
}

export function noteStaffTtsClientError(message: string | null) {
  setStaffTtsError(message ?? 'none');
}
