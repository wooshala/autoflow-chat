import OpenAI, { APIError } from 'openai';
import type { ChatLang } from '@/lib/chat/translateMessageForChat';

const MODEL = 'gpt-4o-mini';
const TRANSLATE_TIMEOUT_MS = 20_000;

let openaiClient: OpenAI | null = null;
let cachedKey: string | null = null;

function getOpenAI(): OpenAI | null {
  const key = process.env.OPENAI_API_KEY?.trim() || '';
  if (!key) {
    openaiClient = null;
    cachedKey = null;
    return null;
  }
  if (openaiClient && cachedKey === key) return openaiClient;
  openaiClient = new OpenAI({ apiKey: key });
  cachedKey = key;
  return openaiClient;
}

const LANG_LABEL: Record<ChatLang, string> = {
  ko: 'Korean',
  ru: 'Russian'
};

const SYSTEM_PROMPT = `You translate short hotel housekeeping staff chat messages between Korean and Russian.
Preserve room numbers exactly (e.g. "708호", "номер 708", "в номере 708").
Use natural, concise language suitable for mobile walkie-talkie communication.
Return ONLY the translated text — no quotes, labels, or explanation.`;

function trimResult(text: string | null | undefined): string | null {
  const s = String(text || '').trim();
  return s || null;
}

function sanitizeOpenAiError(msg: string): string {
  return msg.replace(/sk-[A-Za-z0-9_-]+/g, 'sk-***');
}

/** First 10 + ... + last 6 chars only — never log full key. */
export function maskOpenAiKey(key: string): string {
  const k = String(key || '').trim();
  if (!k) return '(empty)';
  if (k.length <= 16) return `${k.slice(0, 4)}...`;
  return `${k.slice(0, 10)}...${k.slice(-6)}`;
}

function sanitizeJsonForLog(value: unknown): unknown {
  if (typeof value === 'string') return sanitizeOpenAiError(value);
  if (Array.isArray(value)) return value.map(sanitizeJsonForLog);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = sanitizeJsonForLog(v);
    }
    return out;
  }
  return value;
}

/** Structured OpenAI API error for logs (keys redacted). */
export function formatOpenAiApiErrorDetail(error: APIError): {
  status: number | undefined;
  type: string | null;
  code: string | null;
  param: string | null;
  message: string;
  body: unknown;
} {
  const rawBody = error.error;
  const nested =
    rawBody && typeof rawBody === 'object' && rawBody !== null && 'error' in rawBody
      ? (rawBody as { error?: Record<string, unknown> }).error
      : rawBody && typeof rawBody === 'object'
        ? (rawBody as Record<string, unknown>)
        : null;

  const message =
    error.message ||
    (nested && typeof nested.message === 'string' ? nested.message : '') ||
    'OpenAI API error';

  return {
    status: error.status,
    type: error.type ?? (nested && typeof nested.type === 'string' ? nested.type : null) ?? null,
    code: error.code ?? (nested && typeof nested.code === 'string' ? nested.code : null) ?? null,
    param: error.param ?? (nested && typeof nested.param === 'string' ? nested.param : null) ?? null,
    message: sanitizeOpenAiError(message),
    body: sanitizeJsonForLog(rawBody ?? null)
  };
}

/**
 * Single-direction OpenAI translation for staff chat (ko ↔ ru).
 */
export async function openAiTranslateHotelChat(
  text: string,
  fromLang: ChatLang,
  toLang: ChatLang
): Promise<string | null> {
  const input = String(text || '').trim();
  if (!input) return null;
  if (fromLang === toLang) return input;

  const openai = getOpenAI();
  if (!openai) {
    console.log('[CHAT_TRANSLATE_FALLBACK]', {
      reason: 'missing_openai_key',
      fromLang,
      toLang,
      has_openai_key_env: Boolean(process.env.OPENAI_API_KEY?.trim())
    });
    return null;
  }

  console.log('[CHAT_TRANSLATE_START]', { fromLang, toLang, preview: input.slice(0, 80) });

  const keyForCall = process.env.OPENAI_API_KEY?.trim() || '';
  console.log('[CHAT_OPENAI_KEY_MASK]', {
    keyMask: maskOpenAiKey(keyForCall),
    fromLang,
    toLang
  });

  try {
    const response = await Promise.race([
      openai.chat.completions.create({
        model: MODEL,
        temperature: 0.2,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: `Translate from ${LANG_LABEL[fromLang]} to ${LANG_LABEL[toLang]}:\n${input}`
          }
        ]
      }),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('TRANSLATION_TIMEOUT')), TRANSLATE_TIMEOUT_MS);
      })
    ]);

    const result = trimResult(response.choices[0]?.message?.content);
    if (!result) {
      console.log('[CHAT_TRANSLATE_FALLBACK]', { reason: 'empty_model_response', fromLang, toLang });
      return null;
    }
    console.log('[CHAT_TRANSLATE_DONE]', {
      fromLang,
      toLang,
      ok: true,
      preview: result.slice(0, 80)
    });
    return result;
  } catch (error: unknown) {
    if (error instanceof APIError) {
      const apiError = formatOpenAiApiErrorDetail(error);
      console.log('[CHAT_OPENAI_API_ERROR]', apiError);
      console.log('[CHAT_TRANSLATE_FALLBACK]', {
        reason: 'openai_api_error',
        fromLang,
        toLang,
        status: apiError.status ?? null
      });
      return null;
    }

    const msg = error instanceof Error ? error.message : String(error);
    console.log('[CHAT_TRANSLATE_FALLBACK]', {
      reason: msg.includes('TRANSLATION_TIMEOUT') ? 'timeout' : 'openai_error',
      fromLang,
      toLang,
      error: sanitizeOpenAiError(msg)
    });
    return null;
  }
}

/** Test hook: reset cached client (e.g. after env change in dev). */
export function resetOpenAiClientForTests(): void {
  openaiClient = null;
  cachedKey = null;
}
