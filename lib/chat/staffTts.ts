let ttsUnlocked = false;

export function unlockStaffTts() {
  ttsUnlocked = true;
}

export function isStaffTtsUnlocked(): boolean {
  return ttsUnlocked;
}

export function speakStaffRussian(text: string): boolean {
  const preview = String(text || '').trim().slice(0, 120);
  console.log('[STAFF_TTS_START]', { preview, unlocked: ttsUnlocked });

  if (typeof window === 'undefined') {
    console.log('[STAFF_TTS_BLOCKED]', { reason: 'no_window' });
    return false;
  }
  if (!ttsUnlocked) {
    console.log('[STAFF_TTS_BLOCKED]', { reason: 'not_unlocked' });
    return false;
  }
  const synth = window.speechSynthesis;
  if (!synth) {
    console.log('[STAFF_TTS_BLOCKED]', { reason: 'no_speech_synthesis' });
    return false;
  }
  if (!preview) {
    console.log('[STAFF_TTS_BLOCKED]', { reason: 'empty_text' });
    return false;
  }

  try {
    synth.cancel();
    const utter = new SpeechSynthesisUtterance(preview);
    utter.lang = 'ru-RU';
    utter.rate = 0.95;
    utter.onend = () => console.log('[STAFF_TTS_DONE]', { preview });
    utter.onerror = (e) =>
      console.log('[STAFF_TTS_BLOCKED]', { reason: 'utterance_error', error: String(e) });
    synth.speak(utter);
    return true;
  } catch (e) {
    console.log('[STAFF_TTS_BLOCKED]', { reason: 'speak_throw', error: String(e) });
    return false;
  }
}
