export type StaffTtsLocale = 'ru' | 'ko';

export type StaffTtsResult = 'spoken' | 'blocked' | 'no_voice';

let ttsUnlocked = false;

export function unlockStaffTts() {
  ttsUnlocked = true;
}

export function isStaffTtsUnlocked(): boolean {
  return ttsUnlocked;
}

function utteranceLangForLocale(locale: StaffTtsLocale): string {
  return locale === 'ru' ? 'ru-RU' : 'ko-KR';
}

function voiceMatchesLocale(voice: SpeechSynthesisVoice, locale: StaffTtsLocale): boolean {
  const lang = String(voice.lang || '').toLowerCase();
  if (locale === 'ru') return lang === 'ru' || lang.startsWith('ru-');
  return lang === 'ko' || lang.startsWith('ko-');
}

/** Pick a synthesis voice strictly matching locale — never fall back to another language. */
export function selectVoiceForLocale(
  locale: StaffTtsLocale,
  voices: SpeechSynthesisVoice[]
): SpeechSynthesisVoice | null {
  const matches = voices.filter((v) => voiceMatchesLocale(v, locale));
  if (!matches.length) return null;

  const preferredLang = utteranceLangForLocale(locale).toLowerCase();
  const exact = matches.find((v) => String(v.lang || '').toLowerCase() === preferredLang);
  if (exact) return exact;

  const local = matches.find((v) => v.localService);
  return local || matches[0];
}

function getVoicesReady(synth: SpeechSynthesis): Promise<SpeechSynthesisVoice[]> {
  const existing = synth.getVoices();
  if (existing.length) return Promise.resolve(existing);

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      synth.removeEventListener('voiceschanged', onChange);
      resolve(synth.getVoices());
    };
    const onChange = () => finish();
    synth.addEventListener('voiceschanged', onChange);
    window.setTimeout(finish, 2000);
  });
}

export async function speakStaffTts(text: string, locale: StaffTtsLocale): Promise<StaffTtsResult> {
  const preview = String(text || '').trim().slice(0, 120);
  const utterLang = utteranceLangForLocale(locale);

  console.log('[STAFF_TTS_START]', { preview, locale, utterLang, unlocked: ttsUnlocked });

  if (typeof window === 'undefined') {
    console.log('[STAFF_TTS_BLOCKED]', { reason: 'no_window' });
    return 'blocked';
  }
  if (!ttsUnlocked) {
    console.log('[STAFF_TTS_BLOCKED]', { reason: 'not_unlocked' });
    return 'blocked';
  }
  const synth = window.speechSynthesis;
  if (!synth) {
    console.log('[STAFF_TTS_BLOCKED]', { reason: 'no_speech_synthesis' });
    return 'blocked';
  }
  if (!preview) {
    console.log('[STAFF_TTS_BLOCKED]', { reason: 'empty_text' });
    return 'blocked';
  }

  try {
    const voices = await getVoicesReady(synth);
    const voice = selectVoiceForLocale(locale, voices);

    console.log('[STAFF_TTS_VOICE_SELECTED]', {
      text: preview,
      lang: utterLang,
      voiceName: voice?.name ?? null,
      voiceLang: voice?.lang ?? null,
      voiceCount: voices.length,
      locale
    });

    if (!voice) {
      console.log('[STAFF_TTS_BLOCKED]', { reason: 'no_matching_voice', locale, utterLang });
      return 'no_voice';
    }

    if (locale === 'ru' && !voiceMatchesLocale(voice, 'ru')) {
      console.log('[STAFF_TTS_BLOCKED]', { reason: 'refuse_non_ru_voice', voiceLang: voice.lang });
      return 'no_voice';
    }

    synth.cancel();
    const utter = new SpeechSynthesisUtterance(preview);
    utter.lang = utterLang;
    utter.voice = voice;
    utter.rate = 0.95;
    utter.onend = () => console.log('[STAFF_TTS_DONE]', { preview, voiceName: voice.name });
    utter.onerror = (e) =>
      console.log('[STAFF_TTS_BLOCKED]', { reason: 'utterance_error', error: String(e) });
    synth.speak(utter);
    return 'spoken';
  } catch (e) {
    console.log('[STAFF_TTS_BLOCKED]', { reason: 'speak_throw', error: String(e) });
    return 'blocked';
  }
}

/** @deprecated Use speakStaffTts(text, 'ru') */
export function speakStaffRussian(text: string): Promise<StaffTtsResult> {
  return speakStaffTts(text, 'ru');
}
