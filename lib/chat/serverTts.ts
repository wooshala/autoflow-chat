import crypto from 'crypto';
import { openai } from '@/lib/openai';

export type ServerTtsLocale = 'ru';

const MAX_TEXT_LEN = 120;
const MAX_CACHE_ENTRIES = 200;
export const STAFF_TTS_MODEL = 'tts-1';
export const STAFF_TTS_VOICE = 'nova';

const mp3Cache = new Map<string, Buffer>();

export function staffTtsCacheKey(locale: ServerTtsLocale, text: string): string {
  const normalized = String(text || '').trim().slice(0, MAX_TEXT_LEN);
  const hash = crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
  return `${locale}:${hash}`;
}

function cacheGet(key: string): Buffer | undefined {
  const hit = mp3Cache.get(key);
  if (!hit) return undefined;
  mp3Cache.delete(key);
  mp3Cache.set(key, hit);
  return hit;
}

function cacheSet(key: string, value: Buffer): void {
  if (mp3Cache.has(key)) mp3Cache.delete(key);
  mp3Cache.set(key, value);
  while (mp3Cache.size > MAX_CACHE_ENTRIES) {
    const oldest = mp3Cache.keys().next().value;
    if (oldest) mp3Cache.delete(oldest);
    else break;
  }
}

export type SynthesizeStaffTtsResult =
  | { ok: true; mp3: Buffer; cache: 'hit' | 'miss' }
  | { ok: false; reason: 'missing_key' | 'empty_text' | 'unsupported_locale' | 'openai_error' };

export async function synthesizeStaffTtsMp3(
  text: string,
  locale: ServerTtsLocale
): Promise<SynthesizeStaffTtsResult> {
  const preview = String(text || '').trim().slice(0, MAX_TEXT_LEN);
  if (!preview) return { ok: false, reason: 'empty_text' };
  if (locale !== 'ru') return { ok: false, reason: 'unsupported_locale' };
  if (!openai) return { ok: false, reason: 'missing_key' };

  const cacheKey = staffTtsCacheKey(locale, preview);
  const cached = cacheGet(cacheKey);
  if (cached) {
    console.log('[STAFF_SERVER_TTS_CACHE_HIT]', { locale, textLen: preview.length, cacheKey });
    return { ok: true, mp3: cached, cache: 'hit' };
  }

  try {
    console.log('[STAFF_SERVER_TTS_START]', {
      locale,
      textLen: preview.length,
      model: STAFF_TTS_MODEL
    });
    const response = await openai.audio.speech.create({
      model: STAFF_TTS_MODEL,
      voice: STAFF_TTS_VOICE,
      input: preview,
      response_format: 'mp3'
    });
    const mp3 = Buffer.from(await response.arrayBuffer());
    cacheSet(cacheKey, mp3);
    console.log('[STAFF_SERVER_TTS_DONE]', {
      locale,
      textLen: preview.length,
      bytes: mp3.length,
      cacheKey
    });
    return { ok: true, mp3, cache: 'miss' };
  } catch (e: unknown) {
    console.log('[STAFF_SERVER_TTS_FAILED]', {
      locale,
      error: e instanceof Error ? e.message : String(e)
    });
    return { ok: false, reason: 'openai_error' };
  }
}
