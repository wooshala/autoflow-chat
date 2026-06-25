import { getMessageDisplayParts } from '@/lib/chat/displayMessageText';
import { normalizeTranslatedText } from '@/lib/chat/normalizeChatMessage';
import type { ChatLang } from '@/lib/chat/translateMessageForChat';
import type { ChatMessage, TranslatedText } from '@/lib/types';

/** Languages staff TTS may target — extend as translations/server TTS grow. */
export type StaffTtsLang = 'ko' | 'ru' | 'vi' | 'en' | 'zh' | 'th';

export const STAFF_TTS_LANGS: readonly StaffTtsLang[] = ['ko', 'ru', 'vi', 'en', 'zh', 'th'];

/** OpenAI server TTS — add langs here when API route supports them. */
export const SERVER_TTS_SUPPORTED_LANGS: readonly StaffTtsLang[] = ['ru'];

export type StaffTtsLangSource = 'staff_profile' | 'role_fallback' | 'locale_fallback';

export function isStaffTtsLang(value: string): value is StaffTtsLang {
  return (STAFF_TTS_LANGS as readonly string[]).includes(value);
}

export function isServerTtsLangSupported(lang: StaffTtsLang): boolean {
  return SERVER_TTS_SUPPORTED_LANGS.includes(lang);
}

function roleFallbackTtsLang(role: string | null | undefined): StaffTtsLang | null {
  const r = String(role || '').trim().toLowerCase();
  if (!r) return null;
  if (r.includes('clean') || r === 'cleaning' || r === 'cleaning2') return 'ru';
  if (r === 'front' || r === 'admin' || r === 'manager') return 'ko';
  return null;
}

/**
 * Receiver staff TTS language — not UI locale.
 * a) session.spokenLang (staff_invites.spoken_lang)
 * b) role fallback
 * c) UI locale fallback
 */
export function resolveStaffTtsLangFromSession(input: {
  spokenLang: StaffTtsLang | null | undefined;
  role: string | null | undefined;
  uiLocale: string;
}): { ttsLang: StaffTtsLang; ttsLangSource: StaffTtsLangSource } {
  if (input.spokenLang && isStaffTtsLang(input.spokenLang)) {
    return { ttsLang: input.spokenLang, ttsLangSource: 'staff_profile' };
  }
  const fromRole = roleFallbackTtsLang(input.role);
  if (fromRole) {
    return { ttsLang: fromRole, ttsLangSource: 'role_fallback' };
  }
  const ui = isStaffTtsLang(input.uiLocale) ? input.uiLocale : 'ko';
  return { ttsLang: ui, ttsLangSource: 'locale_fallback' };
}

/** @deprecated use resolveStaffTtsLangFromSession */
export function resolveStaffTtsLang(preferredUiLocale: string): StaffTtsLang {
  return resolveStaffTtsLangFromSession({
    spokenLang: null,
    role: null,
    uiLocale: preferredUiLocale
  }).ttsLang;
}

export function getTranslationForTtsLang(
  translated: TranslatedText | null,
  lang: StaffTtsLang
): string {
  if (!translated) return '';
  const raw = translated[lang as keyof TranslatedText];
  return typeof raw === 'string' ? raw.trim() : '';
}

function originalLangMatchesTtsLang(msg: ChatMessage, ttsLang: StaffTtsLang): boolean {
  const originalLang = String(msg.original_lang || '').trim().toLowerCase();
  if (!originalLang) return false;
  return originalLang === ttsLang || originalLang.startsWith(`${ttsLang}-`);
}

export type StaffTtsTextSource = 'translation' | 'primary' | 'original' | 'none';

export type ResolveStaffTtsTextResult = {
  text: string | null;
  ttsLang: StaffTtsLang;
  source: StaffTtsTextSource;
  translationMissing: boolean;
  translatedTtsExists: boolean;
  ttsTextLength: number;
};

/**
 * Auto TTS: translated_text[ttsLang] only, or original when original_lang matches ttsLang.
 */
export function resolveAutoStaffTtsText(
  msg: ChatMessage,
  ttsLang: StaffTtsLang
): ResolveStaffTtsTextResult {
  const translated = normalizeTranslatedText(msg.translated_text);
  const fromTranslation = getTranslationForTtsLang(translated, ttsLang);
  const translatedTtsExists = Boolean(fromTranslation);

  if (fromTranslation) {
    return {
      text: fromTranslation,
      ttsLang,
      source: 'translation',
      translationMissing: false,
      translatedTtsExists: true,
      ttsTextLength: fromTranslation.length
    };
  }

  if (originalLangMatchesTtsLang(msg, ttsLang)) {
    const original = String(msg.message || '').trim();
    if (original) {
      return {
        text: original,
        ttsLang,
        source: 'original',
        translationMissing: true,
        translatedTtsExists: false,
        ttsTextLength: original.length
      };
    }
  }

  return {
    text: null,
    ttsLang,
    source: 'none',
    translationMissing: true,
    translatedTtsExists: false,
    ttsTextLength: 0
  };
}

/**
 * Manual 🔊 read: translation → primary → original.
 */
export function resolveManualStaffTtsText(
  msg: ChatMessage,
  ttsLang: StaffTtsLang,
  viewerLang: ChatLang
): ResolveStaffTtsTextResult {
  const auto = resolveAutoStaffTtsText(msg, ttsLang);
  if (auto.text) return auto;

  const { primary } = getMessageDisplayParts(msg, viewerLang, { selectedLang: ttsLang });
  const primaryText = String(primary || '').trim();
  if (primaryText) {
    return {
      text: primaryText,
      ttsLang,
      source: 'primary',
      translationMissing: true,
      translatedTtsExists: false,
      ttsTextLength: primaryText.length
    };
  }

  const original = String(msg.message || '').trim();
  if (original) {
    return {
      text: original,
      ttsLang,
      source: 'original',
      translationMissing: true,
      translatedTtsExists: false,
      ttsTextLength: original.length
    };
  }

  return {
    text: null,
    ttsLang,
    source: 'none',
    translationMissing: true,
    translatedTtsExists: false,
    ttsTextLength: 0
  };
}

/** @deprecated use resolveAutoStaffTtsText or resolveManualStaffTtsText */
export function resolveStaffTtsText(
  msg: ChatMessage,
  ttsLang: StaffTtsLang,
  viewerLang: ChatLang
): ResolveStaffTtsTextResult {
  return resolveManualStaffTtsText(msg, ttsLang, viewerLang);
}

export function resolveAutoStaffTtsSkipReason(
  resolved: ResolveStaffTtsTextResult
): 'skip_tts_text_missing_initial' | 'skip_no_tts_text' | null {
  if (resolved.text) return null;
  if (!resolved.translatedTtsExists && resolved.source === 'none') {
    return 'skip_tts_text_missing_initial';
  }
  return 'skip_no_tts_text';
}
