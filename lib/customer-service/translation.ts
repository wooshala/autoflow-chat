// Phase 1B — customer-service OpenAI translation adapter (SERVER ONLY).
//
// Reuse boundary: the staff chat translator (lib/chat/openAiChatTranslate.ts
// `openAiTranslateHotelChat`) is language-LOCKED to ko/ru, so it cannot serve
// zh-CN/ja/en guests. We keep the SAME contract and reuse its exported,
// language-agnostic helpers (maskOpenAiKey, formatOpenAiApiErrorDetail) rather than
// rewriting error/redaction logic. The staff module is NOT modified.
//
// Contract (identical to staff): translate() returns the translated string, or null
// on missing key / API error / timeout / empty. null MUST leave the original intact
// upstream (customer_messages.original_text is written separately).
//
// Do NOT import this file from a client component — it pulls in `openai`. Client
// code imports from ./translationLangs instead.

import OpenAI, { APIError } from 'openai';
import { formatOpenAiApiErrorDetail, maskOpenAiKey } from '@/lib/chat/openAiChatTranslate';
import { LANG_LABEL, type CustomerLang, type CustomerTranslator } from './translationLangs';

const MODEL = 'gpt-4o-mini';
const TRANSLATE_TIMEOUT_MS = 20_000;

// Guest-facing hotel front-desk prompt. Extends the staff housekeeping prompt to
// preserve entities that must never change in guest communication.
const CUSTOMER_SYSTEM_PROMPT = `You translate short hotel front-desk messages between a foreign guest and Korean front-desk staff.
Translate faithfully and politely, in natural language suitable for a hotel guest.
Do NOT change any of the following — copy them exactly: room numbers, dates, times, numbers, prices/amounts and currency, and place/landmark/line names (e.g. bus/subway line numbers, station and restaurant names).
Return ONLY the translated text — no quotes, labels, or explanation.`;

let client: OpenAI | null = null;
let cachedKey: string | null = null;
function getOpenAI(): OpenAI | null {
  const key = process.env.OPENAI_API_KEY?.trim() || '';
  if (!key) {
    client = null;
    cachedKey = null;
    return null;
  }
  if (client && cachedKey === key) return client;
  client = new OpenAI({ apiKey: key });
  cachedKey = key;
  return client;
}

export const openAiCustomerTranslator: CustomerTranslator = {
  name: 'openai:gpt-4o-mini',
  async translate(text, from, to) {
    const input = String(text || '').trim();
    if (!input) return null;
    if (from === to) return input;
    const openai = getOpenAI();
    if (!openai) {
      console.log('[CUSTOMER_TRANSLATE_FALLBACK]', { reason: 'missing_openai_key', from, to });
      return null;
    }
    console.log('[CUSTOMER_TRANSLATE_START]', {
      from,
      to,
      keyMask: maskOpenAiKey(process.env.OPENAI_API_KEY?.trim() || ''),
    });
    try {
      const response = await Promise.race([
        openai.chat.completions.create({
          model: MODEL,
          temperature: 0.2,
          messages: [
            { role: 'system', content: CUSTOMER_SYSTEM_PROMPT },
            {
              role: 'user',
              content: `Translate from ${LANG_LABEL[from as CustomerLang]} to ${LANG_LABEL[to as CustomerLang]}:\n${input}`,
            },
          ],
        }),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('TRANSLATION_TIMEOUT')), TRANSLATE_TIMEOUT_MS);
        }),
      ]);
      const result = String(response.choices[0]?.message?.content || '').trim();
      if (!result) {
        console.log('[CUSTOMER_TRANSLATE_FALLBACK]', { reason: 'empty_model_response', from, to });
        return null;
      }
      return result;
    } catch (error: unknown) {
      if (error instanceof APIError) {
        console.log('[CUSTOMER_OPENAI_API_ERROR]', formatOpenAiApiErrorDetail(error));
        return null;
      }
      const msg = error instanceof Error ? error.message : String(error);
      console.log('[CUSTOMER_TRANSLATE_FALLBACK]', {
        reason: msg.includes('TRANSLATION_TIMEOUT') ? 'timeout' : 'openai_error',
      });
      return null;
    }
  },
};
