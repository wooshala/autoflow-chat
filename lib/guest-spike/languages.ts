// Phase 1H.5 — guest language support: the supported set, a script-based heuristic
// detector (fallback under the LLM), original_lang priority resolver, and per-language
// guest UI strings. Pure + import-free (no @/ alias) so it runs under `node --test`.
// Language NAMES only — never flags (language ≠ nationality). GuestLang is structurally
// identical to CustomerLang (same 5 literals), so it is assignable across the codebase.

export type GuestLang = 'ko' | 'en' | 'ja' | 'zh-CN' | 'ru' | 'fr' | 'es';

/** Ordered for the selection screen. */
export const SUPPORTED_LANGS: readonly GuestLang[] = ['ko', 'en', 'ja', 'zh-CN', 'ru', 'fr', 'es'];

export function isGuestLang(v: unknown): v is GuestLang {
  return typeof v === 'string' && (SUPPORTED_LANGS as readonly string[]).includes(v);
}

const LANG_NAME: Record<GuestLang, string> = {
  ko: '한국어',
  en: 'English',
  ja: '日本語',
  'zh-CN': '中文(简体)',
  ru: 'Русский',
  fr: 'Français',
  es: 'Español',
};

export function langDisplayName(lang: GuestLang): string {
  return LANG_NAME[lang];
}

/**
 * Heuristic language detector (FALLBACK under the LLM). Order matters: kana before Han
 * (Japanese uses Han too), then Hangul / Cyrillic / Han-only(→zh-CN) / Latin(→en).
 * Returns null when nothing classifies (empty / symbols / emoji) so the caller can fall
 * back to the channel preferred language.
 */
export function detectGuestLangHeuristic(text: string): GuestLang | null {
  const s = String(text || '');
  if (/[぀-ヿ]/.test(s)) return 'ja'; // Hiragana / Katakana
  if (/[가-힣]/.test(s)) return 'ko'; // Hangul syllables
  if (/[Ѐ-ӿ]/.test(s)) return 'ru'; // Cyrillic
  if (/[一-鿿]/.test(s)) return 'zh-CN'; // Han without kana → Simplified Chinese
  if (/[a-zA-Z]/.test(s)) return 'en'; // Latin
  return null;
}

/**
 * Resolve a guest message's original_lang. Priority: LLM detected → heuristic → channel
 * preferred → 'en' last resort. `usedFallback` is true when neither the LLM nor the
 * heuristic classified the text (caller logs GUEST_LANGUAGE_DETECTION_FALLBACK).
 */
export function resolveOriginalLang(input: {
  llmDetected: GuestLang | null;
  text: string;
  preferred: GuestLang | null;
}): { lang: GuestLang; usedFallback: boolean } {
  if (input.llmDetected) return { lang: input.llmDetected, usedFallback: false };
  const heuristic = detectGuestLangHeuristic(input.text);
  if (heuristic) return { lang: heuristic, usedFallback: false };
  return { lang: input.preferred ?? 'en', usedFallback: true };
}

// ── guest UI strings (simple constant map; NOT a full i18n framework) ─────────────
export interface GuestUiText {
  title: string;
  selectPrompt: string;
  selectPromptEn: string; // always shown under the localized prompt
  placeholder: string;
  send: string;
  sending: string;
  changeLanguage: string;
  errorSend: string; // translation/send failed — draft kept
  errorLanguageSave: string; // PUT language failed
  // Sender role labels shown UNDER each bubble on the GUEST (mobile) surface. They follow the
  // guest's SELECTED display language — never the per-message detected language, the staff
  // input language, the browser locale, or a fixed default. (Staff surfaces use their own
  // fixed Korean labels, so these are guest-side only.)
  guestSelfLabel: string; // the guest's own messages ("Me")
  staffLabel: string; // the hotel staff's messages ("Staff")
}

export const guestUiText: Record<GuestLang, GuestUiText> = {
  ko: {
    title: '객실 고객 채팅',
    selectPrompt: '언어를 선택해 주세요',
    selectPromptEn: 'Please select your language',
    placeholder: '메시지를 입력하세요',
    send: '전송',
    sending: '전송 중…',
    changeLanguage: '언어 변경',
    errorSend: '전송에 실패했습니다. 다시 시도해 주세요.',
    errorLanguageSave: '언어 저장에 실패했습니다. 다시 시도해 주세요.',
    guestSelfLabel: '나',
    staffLabel: '직원',
  },
  en: {
    title: 'Room Guest Chat',
    selectPrompt: 'Please select your language',
    selectPromptEn: 'Please select your language',
    placeholder: 'Type a message',
    send: 'Send',
    sending: 'Sending…',
    changeLanguage: 'Change language',
    errorSend: 'Failed to send. Please try again.',
    errorLanguageSave: 'Failed to save language. Please try again.',
    guestSelfLabel: 'Me',
    staffLabel: 'Staff',
  },
  ja: {
    title: 'ルームチャット',
    selectPrompt: '言語を選択してください',
    selectPromptEn: 'Please select your language',
    placeholder: 'メッセージを入力',
    send: '送信',
    sending: '送信中…',
    changeLanguage: '言語を変更',
    errorSend: '送信に失敗しました。もう一度お試しください。',
    errorLanguageSave: '言語の保存に失敗しました。もう一度お試しください。',
    guestSelfLabel: '私',
    staffLabel: 'スタッフ',
  },
  'zh-CN': {
    title: '客房聊天',
    selectPrompt: '请选择语言',
    selectPromptEn: 'Please select your language',
    placeholder: '输入消息',
    send: '发送',
    sending: '发送中…',
    changeLanguage: '更改语言',
    errorSend: '发送失败，请重试。',
    errorLanguageSave: '语言保存失败，请重试。',
    guestSelfLabel: '我',
    staffLabel: '前台',
  },
  ru: {
    title: 'Чат номера',
    selectPrompt: 'Пожалуйста, выберите язык',
    selectPromptEn: 'Please select your language',
    placeholder: 'Введите сообщение',
    send: 'Отправить',
    sending: 'Отправка…',
    changeLanguage: 'Сменить язык',
    errorSend: 'Не удалось отправить. Попробуйте снова.',
    errorLanguageSave: 'Не удалось сохранить язык. Попробуйте снова.',
    guestSelfLabel: 'Я',
    staffLabel: 'Персонал',
  },
  fr: {
    title: 'Chat de la chambre',
    selectPrompt: 'Veuillez sélectionner votre langue',
    selectPromptEn: 'Please select your language',
    placeholder: 'Saisissez un message',
    send: 'Envoyer',
    sending: 'Envoi…',
    changeLanguage: 'Changer de langue',
    errorSend: 'Échec de l’envoi. Veuillez réessayer.',
    errorLanguageSave: 'Échec de l’enregistrement de la langue. Veuillez réessayer.',
    guestSelfLabel: 'Moi',
    staffLabel: 'Réception',
  },
  es: {
    title: 'Chat de la habitación',
    selectPrompt: 'Seleccione su idioma',
    selectPromptEn: 'Please select your language',
    placeholder: 'Escriba un mensaje',
    send: 'Enviar',
    sending: 'Enviando…',
    changeLanguage: 'Cambiar idioma',
    errorSend: 'Error al enviar. Inténtelo de nuevo.',
    errorLanguageSave: 'Error al guardar el idioma. Inténtelo de nuevo.',
    guestSelfLabel: 'Yo',
    staffLabel: 'Recepción',
  },
};

/** UI text for a possibly-unresolved language (selection screen defaults to English). */
export function uiTextFor(lang: GuestLang | null): GuestUiText {
  return guestUiText[lang ?? 'en'];
}

// ── guest STATUS screens (ended / occupied) ─────────────────────────────────────────
// These screens appear BEFORE the guest has (or after they've lost) a chosen language —
// 'occupied' is shown to a brand-new cookieless device with no language at all — so the UI
// renders every supported language at once (stacked). Kept as a typed Record<GuestLang> so the
// type checker enforces a string for EVERY supported language (same validation path as guestUiText).
export interface GuestStatusText {
  endedTitle: string; // conversation ended (staff closed it)
  occupiedTitle: string; // room chat is already in use on another device
  occupiedHelp: string; // reopen on the first phone, or contact the front desk
}

export const guestStatusText: Record<GuestLang, GuestStatusText> = {
  ko: {
    endedTitle: '대화가 종료되었습니다',
    occupiedTitle: '이 객실 채팅은 다른 기기에서 사용 중입니다',
    occupiedHelp: '처음 사용한 휴대폰에서 다시 열거나 프런트 데스크에 문의해 주세요',
  },
  en: {
    endedTitle: 'This conversation has ended',
    occupiedTitle: 'This room chat is in use on another device',
    occupiedHelp: 'Please reopen it on the first phone, or contact the front desk',
  },
  ja: {
    endedTitle: 'この会話は終了しました',
    occupiedTitle: 'この客室チャットは他の端末で使用中です',
    occupiedHelp: '最初に使用した端末で開き直すか、フロントにお問い合わせください',
  },
  'zh-CN': {
    endedTitle: '对话已结束',
    occupiedTitle: '此客房聊天正在其他设备上使用',
    occupiedHelp: '请在最初使用的手机上重新打开，或联系前台',
  },
  ru: {
    endedTitle: 'Разговор завершён',
    occupiedTitle: 'Этот чат номера используется на другом устройстве',
    occupiedHelp: 'Откройте его на первом телефоне или обратитесь на стойку регистрации',
  },
  fr: {
    endedTitle: 'Cette conversation est terminée',
    occupiedTitle: 'Ce chat de chambre est utilisé sur un autre appareil',
    occupiedHelp: 'Veuillez le rouvrir sur le premier téléphone ou contacter la réception',
  },
  es: {
    endedTitle: 'Esta conversación ha finalizado',
    occupiedTitle: 'Este chat de la habitación está en uso en otro dispositivo',
    occupiedHelp: 'Vuelva a abrirlo en el primer teléfono o contacte con recepción',
  },
};

// ── staff room-language badge decision (Phase 1H.7 language-on-session fix) ────────────────
// The staff UI must NEVER confuse "no active guest" with "guest present, no language yet".
export type GuestLanguageBadge =
  | { kind: 'hidden' } //     no active guest → show no language badge
  | { kind: 'unselected' } // guest present, hasn't chosen → gray "언어 미선택"
  | { kind: 'language'; lang: GuestLang }; // guest present + language → the language badge

/**
 * Decide the staff-side language badge from the session_status + language of an active session.
 *  - session_status !== 'open' ('none' / unknown-null) → hidden  (no active guest)
 *  - open + no language                                → unselected
 *  - open + language                                   → language
 */
export function resolveGuestLanguageBadge(input: {
  sessionStatus: 'open' | 'none' | null;
  language: GuestLang | null;
}): GuestLanguageBadge {
  if (input.sessionStatus !== 'open') return { kind: 'hidden' };
  return input.language ? { kind: 'language', lang: input.language } : { kind: 'unselected' };
}
