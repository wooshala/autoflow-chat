// Phase 1B — client-safe translation types/labels + mock translator.
// NO 'openai' import here, so client components can use it without bundling server code.
// The real OpenAI adapter lives in translation.ts (server-only).

export type CustomerLang = 'ko' | 'zh-CN' | 'ja' | 'en' | 'ru';

export const CUSTOMER_LANGS: readonly CustomerLang[] = ['ko', 'zh-CN', 'ja', 'en', 'ru'];

/** English names for the translation prompt (server). */
export const LANG_LABEL: Record<CustomerLang, string> = {
  ko: 'Korean',
  'zh-CN': 'Simplified Chinese',
  ja: 'Japanese',
  en: 'English',
  ru: 'Russian',
};

/** Display name for badges. Language ≠ nationality — always show the language. */
export const LANG_DISPLAY: Record<CustomerLang, string> = {
  ko: '한국어',
  'zh-CN': '中文(简体)',
  ja: '日本語',
  en: 'English',
  ru: 'Русский',
};

export function isCustomerLang(v: unknown): v is CustomerLang {
  return typeof v === 'string' && (CUSTOMER_LANGS as readonly string[]).includes(v);
}

export interface CustomerTranslator {
  /** Returns translated text or null on failure (original preserved upstream). */
  translate(text: string, from: CustomerLang, to: CustomerLang): Promise<string | null>;
  readonly name: string;
}

/** Phase 1B PoC translator — deterministic, visibly-mock, no API cost. */
export const mockCustomerTranslator: CustomerTranslator = {
  name: 'mock',
  async translate(text, from, to) {
    const input = String(text || '').trim();
    if (!input) return null;
    if (from === to) return input;
    return `〔${LANG_DISPLAY[to]} mock〕 ${input}`;
  },
};

/**
 * Translate `text` into each target language, keeping the ORIGINAL separate. A
 * per-language null (failure) is recorded as a miss and must never overwrite the
 * original upstream.
 */
export async function buildCustomerTranslations(
  translator: CustomerTranslator,
  text: string,
  from: CustomerLang,
  targets: CustomerLang[],
): Promise<{ translated: Partial<Record<CustomerLang, string>>; failed: CustomerLang[] }> {
  const translated: Partial<Record<CustomerLang, string>> = {};
  const failed: CustomerLang[] = [];
  for (const to of targets) {
    if (to === from) continue;
    const out = await translator.translate(text, from, to);
    if (out) translated[to] = out;
    else failed.push(to);
  }
  return { translated, failed };
}
