import type { ChatMessage } from '@/lib/types';
import type { ChatLang } from '@/lib/chat/translateMessageForChat';
import { detectMessageLang } from '@/lib/chat/translateMessageForChat';
import { normalizeTranslatedText } from '@/lib/chat/normalizeChatMessage';

export type MessageDisplayLogContext = 'staff' | 'pc';

export type MessageDisplayOpts = {
  logContext?: MessageDisplayLogContext;
  /** Staff-chat UI language (ko | vi | ru) — vi falls back to ko viewer. */
  selectedLang?: string;
};

type DisplaySource = 'translated_text.ru' | 'translated_text.ko' | 'message' | 'message_secondary_only';

function isKoreanText(text: string): boolean {
  return detectMessageLang(text) === 'ko' || /[가-힣]/.test(text);
}

function isRussianText(text: string): boolean {
  return detectMessageLang(text) === 'ru' || /[а-яА-ЯёЁ]/.test(text);
}

/** Primary (large) + optional original (small) for bilingual walkie UI. */
export function getMessageDisplayParts(
  msg: ChatMessage,
  viewerLang: ChatLang,
  opts?: MessageDisplayOpts
) {
  const original = String(msg.message || '').trim();
  const translated = normalizeTranslatedText(msg.translated_text);
  const ru = translated?.ru?.trim() || '';
  const ko = translated?.ko?.trim() || '';
  const originalLang = String(msg.original_lang || '').trim() || detectMessageLang(original) || '';

  let primary = '';
  let secondary: string | null = null;
  let source: DisplaySource = 'message';
  let ttsText: string | null = null;

  if (viewerLang === 'ru') {
    ttsText = ru || null;
    if (ru) {
      primary = ru;
      source = 'translated_text.ru';
      if (original && original !== ru && isKoreanText(original)) {
        secondary = original;
      }
    } else if (isRussianText(original)) {
      primary = original;
      source = 'message';
    } else if (isKoreanText(original)) {
      primary = '';
      secondary = original;
      source = 'message_secondary_only';
    } else {
      primary = original;
      source = 'message';
    }
  } else {
    if (ko && ko !== original) {
      primary = ko;
      source = 'translated_text.ko';
      if (original && original !== ko && isRussianText(original)) {
        secondary = original;
      }
    } else if (ko) {
      primary = ko;
      source = 'translated_text.ko';
    } else if (isKoreanText(original)) {
      primary = original;
      source = 'message';
    } else if (isRussianText(original)) {
      primary = '';
      secondary = original;
      source = 'message_secondary_only';
    } else {
      primary = original;
      source = 'message';
    }
  }

  if (!primary && secondary && source !== 'message_secondary_only') {
    primary = secondary;
    secondary = null;
  }

  const debugDisplayText = process.env.NODE_ENV !== 'production';

  if (debugDisplayText && opts?.logContext === 'staff' && typeof console !== 'undefined') {
    console.log('[STAFF_CHAT_DISPLAY_TEXT]', {
      message_id: msg.id ?? null,
      selected_lang: opts.selectedLang ?? viewerLang,
      original_lang: originalLang || null,
      has_ru: Boolean(ru),
      has_ko: Boolean(ko),
      source
    });
  }

  if (debugDisplayText && opts?.logContext === 'pc' && typeof console !== 'undefined') {
    console.log('[CHAT_DISPLAY_TEXT]', {
      message_id: msg.id ?? null,
      selected_lang: 'ko',
      original_lang: originalLang || null,
      has_ru: Boolean(ru),
      has_ko: Boolean(ko),
      source
    });
  }

  return { primary, secondary, ttsText };
}
