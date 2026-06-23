import type { ChatMessage, TranslatedText } from '@/lib/types';

/** Parse jsonb that may arrive as a JSON string from realtime or legacy rows. */
export function normalizeTranslatedText(raw: unknown): TranslatedText | null {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as TranslatedText;
      }
      return null;
    } catch {
      return null;
    }
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as TranslatedText;
  }
  return null;
}

/** Merge jsonb language fields without dropping ko/ru on partial realtime rows. */
export function mergeTranslatedText(
  prev: TranslatedText | null | undefined,
  incoming: TranslatedText | null | undefined
): TranslatedText | null {
  const merged: TranslatedText = { ...(prev || {}), ...(incoming || {}) };
  for (const key of ['ko', 'ru', 'vi', 'en'] as const) {
    const v = merged[key];
    if (typeof v !== 'string' || !v.trim()) {
      delete merged[key];
    } else {
      merged[key] = v.trim();
    }
  }
  return Object.keys(merged).length > 0 ? merged : null;
}

export function normalizeChatMessageFields<T extends Partial<ChatMessage>>(msg: T): T {
  if (!msg) return msg;
  return {
    ...msg,
    translated_text: normalizeTranslatedText(msg.translated_text),
    back_translated_text: normalizeTranslatedText(msg.back_translated_text)
  };
}

/** Merge realtime/list rows without dropping bilingual fields on partial updates. */
export function mergeChatMessageRow(
  prev: ChatMessage | undefined,
  incoming: Partial<ChatMessage> & { id?: string }
): ChatMessage {
  const id = incoming?.id != null ? String(incoming.id) : prev?.id ? String(prev.id) : '';
  const base = prev ? { ...prev } : ({ id } as ChatMessage);
  const merged = { ...base, ...incoming, id } as ChatMessage;
  const prevTt = normalizeTranslatedText(prev?.translated_text);
  const incomingTt = normalizeTranslatedText(incoming.translated_text);
  merged.translated_text = mergeTranslatedText(prevTt, incomingTt);
  const prevBack = normalizeTranslatedText(prev?.back_translated_text);
  const incomingBack = normalizeTranslatedText(incoming.back_translated_text);
  merged.back_translated_text = mergeTranslatedText(prevBack, incomingBack);
  if (!merged.original_lang && prev?.original_lang) {
    merged.original_lang = prev.original_lang;
  }
  return normalizeChatMessageFields(merged);
}
