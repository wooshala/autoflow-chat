/** Documented auto-TTS path from Supabase Realtime INSERT to audio.play(). */
export const STAFF_AUTO_TTS_CALL_PATH =
  'useChatRealtime.postgres_changes(INSERT|UPDATE) -> setMessages(React) -> StaffChatClient.useEffect[messages] -> runStaffTts(fromUserGesture=false) -> playStaffTts -> playServerStaffTts -> await fetch(/api/staff/tts) -> singletonAudio.src=blobUrl -> load() -> await audio.play()';

export type StaffTtsUserActivationSnap = {
  isActive: boolean | null;
  hasBeenActive: boolean | null;
  autoplayPolicy: string | null;
};

export function peekStaffTtsUserActivation(): StaffTtsUserActivationSnap {
  if (typeof navigator === 'undefined') {
    return { isActive: null, hasBeenActive: null, autoplayPolicy: null };
  }

  const ua = navigator.userActivation;
  let autoplayPolicy: string | null = null;
  try {
    const getAutoplayPolicy = (
      navigator as Navigator & { getAutoplayPolicy?: (type: string) => string }
    ).getAutoplayPolicy;
    if (typeof getAutoplayPolicy === 'function') {
      autoplayPolicy = getAutoplayPolicy('mediaelement');
    }
  } catch {
    /* not supported */
  }

  return {
    isActive: ua?.isActive ?? null,
    hasBeenActive: ua?.hasBeenActive ?? null,
    autoplayPolicy
  };
}

export function captureCallStack(maxLines = 12): string {
  try {
    const stack = new Error('[STAFF_TTS_CALL_STACK]').stack ?? '';
    return stack
      .split('\n')
      .slice(1, 1 + maxLines)
      .map((line) => line.trim())
      .join(' | ');
  } catch {
    return '';
  }
}

export function logStaffTtsUserActivation(
  phase: string,
  extra?: Record<string, unknown>
): StaffTtsUserActivationSnap {
  const snap = peekStaffTtsUserActivation();
  console.log('[STAFF_TTS_USER_ACTIVATION]', {
    phase,
    isActive: snap.isActive,
    hasBeenActive: snap.hasBeenActive,
    autoplayPolicy: snap.autoplayPolicy,
    callPath: STAFF_AUTO_TTS_CALL_PATH,
    callStack: captureCallStack(),
    ...extra
  });
  return snap;
}
