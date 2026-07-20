// Phase 1H.1 → 1H.2 — single source of truth for a bubble's two lines. Pure + language-
// agnostic. The renderer NEVER selects a string or branches on language; it only draws
// line 1 then line 2. ALL mine/staff/guest/language logic lives here.
//
// Unified meaning (1H.2):
//   primaryText   = the message in the VIEWER's reading language           (line 1)
//   secondaryText = the message in the COUNTERPART's language —            (line 2)
//                   i.e. the OPPOSITE language actually delivered to the other party.
//   showSecondary = secondaryText exists AND differs from primaryText.
//
// Field-name note: MessageBubble is frozen ("절대 수정 금지") and consumes
// { displayText, originalText, showOriginal }. To avoid touching it we keep those wire
// names, but their MEANING is now primary / secondary / showSecondary respectively:
//   displayText  ≡ primaryText   ·  originalText ≡ secondaryText  ·  showOriginal ≡ showSecondary
//
// Adding a language (en/zh-CN/ru/…) needs NO change here and NONE in the renderer: the
// caller passes viewerLang + counterpartLang, and translated is a BCP-47 keyed map.

export interface ViewMessage {
  original: string;
  original_lang: string;
  translated: Record<string, string>;
}

export interface MessageViewModel {
  /** primaryText — viewer's reading language (line 1). */
  displayText: string;
  /** secondaryText — the opposite (counterpart) language delivered to the other party (line 2). */
  originalText: string;
  /** showSecondary — secondary exists AND differs from primary. */
  showOriginal: boolean;
}

/** Resolve the message in a given language: the original if it is already that language,
 *  otherwise the stored translation for it (undefined when that translation is missing). */
function inLang(message: ViewMessage, lang: string): string | undefined {
  return message.original_lang === lang ? message.original : message.translated[lang];
}

export function buildMessageViewModel(
  message: ViewMessage,
  viewerLang: string,
  counterpartLang: string,
): MessageViewModel {
  const primary = inLang(message, viewerLang) ?? message.original; // fallback: never blank
  const secondary = inLang(message, counterpartLang);
  return {
    displayText: primary,
    originalText: secondary ?? '',
    showOriginal: secondary != null && secondary !== primary,
  };
}
