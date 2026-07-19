// Phase 1F.9 — pure validation for the customer-service translate API. DOM/OpenAI-free
// so it is unit-testable. Lang codes = the BCP-47 CustomerLang set (inline to stay
// import-free for the Node type-stripping test runner).

export const MAX_TRANSLATE_TEXT_LEN = 2000;

export const TRANSLATE_LANG_CODES = ['ko', 'zh-CN', 'ja', 'en', 'ru'] as const;
export type TranslateLang = (typeof TRANSLATE_LANG_CODES)[number];

export function isTranslateLang(v: unknown): v is TranslateLang {
  return typeof v === 'string' && (TRANSLATE_LANG_CODES as readonly string[]).includes(v);
}

export type ValidateTranslateResult =
  | { ok: true; text: string; from: TranslateLang; to: TranslateLang; sameLang: boolean }
  | { ok: false; code: string; message: string; status: number };

/** Validate a POST body: text non-empty & bounded, from/to are allowed lang codes. */
export function validateTranslateRequest(input: unknown): ValidateTranslateResult {
  const body = (input ?? {}) as { text?: unknown; from?: unknown; to?: unknown };

  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) {
    return { ok: false, code: 'VALIDATION_ERROR', message: 'text is required', status: 400 };
  }
  if (text.length > MAX_TRANSLATE_TEXT_LEN) {
    return { ok: false, code: 'TEXT_TOO_LONG', message: `text exceeds ${MAX_TRANSLATE_TEXT_LEN} chars`, status: 400 };
  }
  if (!isTranslateLang(body.from) || !isTranslateLang(body.to)) {
    return { ok: false, code: 'UNSUPPORTED_LANGUAGE', message: 'from/to must be supported language codes', status: 400 };
  }
  return { ok: true, text, from: body.from, to: body.to, sameLang: body.from === body.to };
}
