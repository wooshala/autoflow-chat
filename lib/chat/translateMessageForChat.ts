import type { TranslatedText } from '@/lib/types';
import type { SenderSide } from '@/lib/types';
import { openAiTranslateHotelChat } from '@/lib/chat/openAiChatTranslate';

export type ChatLang = 'ko' | 'ru';

export function normalizeChatText(text: string): string {
  return String(text || '')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Strip leading "507호 " prefix when mobile still embeds room in message body. */
export function stripLeadingRoomPrefix(text: string): string {
  const normalized = normalizeChatText(text);
  const match = normalized.match(/^(\d{3,4})호\s+(.+)$/u);
  return match ? normalizeChatText(match[2]) : normalized;
}

export function detectMessageLang(text: string): ChatLang | null {
  const s = String(text || '');
  if (/[а-яА-ЯёЁ]/.test(s)) return 'ru';
  if (/[가-힣]/.test(s)) return 'ko';
  return null;
}

function resolveSourceLang(message: string, senderSide: SenderSide | null | undefined): ChatLang {
  const full = normalizeChatText(message);
  const side = senderSide === 'mobile' ? 'mobile' : 'pc';
  const lookupText = side === 'mobile' ? stripLeadingRoomPrefix(full) : full;
  if (side === 'pc') {
    return detectMessageLang(full) ?? 'ko';
  }
  return detectMessageLang(lookupText) ?? 'ko';
}

export type ChatTranslationBundle = {
  original_lang: string;
  translated_text: TranslatedText | null;
  back_translated_text: TranslatedText | null;
};

/**
 * OpenAI forward + back-translate for staff walkie chat.
 * - ko source: translated_text.ru + back_translated_text.ko
 * - ru source: translated_text.ko + back_translated_text.ru
 */
export async function buildChatTranslations(
  message: string,
  senderSide: SenderSide | null | undefined
): Promise<ChatTranslationBundle> {
  const full = normalizeChatText(message);
  if (!full) {
    return { original_lang: '', translated_text: null, back_translated_text: null };
  }

  const fromLang = resolveSourceLang(full, senderSide);
  const toLang: ChatLang = fromLang === 'ko' ? 'ru' : 'ko';

  const forward = await openAiTranslateHotelChat(full, fromLang, toLang);

  let back: string | null = null;
  if (forward) {
    console.log('[CHAT_BACK_TRANSLATE_START]', {
      fromLang: toLang,
      toLang: fromLang,
      preview: forward.slice(0, 80)
    });
    back = await openAiTranslateHotelChat(forward, toLang, fromLang);
    console.log('[CHAT_BACK_TRANSLATE_DONE]', {
      fromLang: toLang,
      toLang: fromLang,
      ok: Boolean(back),
      preview: back?.slice(0, 80) ?? null
    });
  }

  const translated_text: TranslatedText = {};
  const back_translated_text: TranslatedText = {};

  if (fromLang === 'ko') {
    translated_text.ko = full;
    if (forward) translated_text.ru = forward;
    if (back) back_translated_text.ko = back;
  } else {
    translated_text.ru = full;
    if (forward) translated_text.ko = forward;
    if (back) back_translated_text.ru = back;
  }

  const hasTranslated = Boolean(translated_text.ko || translated_text.ru);
  const hasBack = Boolean(back_translated_text.ko || back_translated_text.ru);

  return {
    original_lang: fromLang,
    translated_text: hasTranslated ? translated_text : null,
    back_translated_text: hasBack ? back_translated_text : null
  };
}

/** @deprecated Use buildChatTranslations */
export const buildWalkieTranslations = buildChatTranslations;
