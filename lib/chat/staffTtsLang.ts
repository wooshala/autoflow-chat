import { getMessageDisplayParts } from '@/lib/chat/displayMessageText';
import { normalizeTranslatedText } from '@/lib/chat/normalizeChatMessage';
import type { ChatLang } from '@/lib/chat/translateMessageForChat';
import type { ChatMessage, TranslatedText } from '@/lib/types';

/** Languages staff TTS may target — extend as translations/server TTS grow. */
export type StaffTtsLang = 'ko' | 'ru' | 'vi' | 'en' | 'zh' | 'th';

export const STAFF_TTS_LANGS: readonly StaffTtsLang[] = ['ko', 'ru', 'vi', 'en', 'zh', 'th'];

/** OpenAI server TTS — add langs here when API route supports them. */
export const SERVER_TTS_SUPPORTED_LANGS: readonly StaffTtsLang[] = ['ru'];

export function isStaffTtsLang(value: string): value is StaffTtsLang {
  return (STAFF_TTS_LANGS as readonly string[]).includes(value);
}

export function isServerTtsLangSupported(lang: StaffTtsLang): boolean {
  return SERVER_TTS_SUPPORTED_LANGS.includes(lang);
}

/**
 * Staff preferred UI language → TTS language.
 * Independent of viewerLang used for on-screen bilingual layout.
 */
export function resolveStaffTtsLang(preferredUiLocale: string): StaffTtsLang {
  if (isStaffTtsLang(preferredUiLocale)) return preferredUiLocale;
  return 'ko';
}

export function getTranslationForTtsLang(
  translated: TranslatedText | null,
  lang: StaffTtsLang
): string {
  if (!translated) return '';
  const raw = translated[lang as keyof TranslatedText];
  return typeof raw === 'string' ? raw.trim() : '';
}

export type StaffTtsTextSource = 'translation' | 'primary' | 'original' | 'none';

export type ResolveStaffTtsTextResult = {
  text: string | null;
  ttsLang: StaffTtsLang;
  source: StaffTtsTextSource;
  translationMissing: boolean;
};

/**
 * Resolve speakable text for staff TTS:
 * 1) translated_text[ttsLang]
 * 2) display primary (viewer layout)
 * 3) original message body
 */
export function resolveStaffTtsText(
  msg: ChatMessage,
  ttsLang: StaffTtsLang,
  viewerLang: ChatLang
): ResolveStaffTtsTextResult {
  const translated = normalizeTranslatedText(msg.translated_text);
  const fromTranslation = getTranslationForTtsLang(translated, ttsLang);
  if (fromTranslation) {
    return { text: fromTranslation, ttsLang, source: 'translation', translationMissing: false };
  }

  const { primary } = getMessageDisplayParts(msg, viewerLang, { selectedLang: ttsLang });
  const primaryText = String(primary || '').trim();
  if (primaryText) {
    return {
      text: primaryText,
      ttsLang,
      source: 'primary',
      translationMissing: true
    };
  }

  const original = String(msg.message || '').trim();
  if (original) {
    return {
      text: original,
      ttsLang,
      source: 'original',
      translationMissing: true
    };
  }

  return { text: null, ttsLang, source: 'none', translationMissing: true };
}

export function resolveStaffTtsTriggerSkipReason(
  resolved: ResolveStaffTtsTextResult
): 'skip_no_tts_text' | 'skip_tts_text_missing' | null {
  if (resolved.text) return null;
  if (resolved.translationMissing && resolved.source === 'none') {
    return 'skip_tts_text_missing';
  }
  return 'skip_no_tts_text';
}
