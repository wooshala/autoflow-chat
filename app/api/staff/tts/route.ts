import { NextRequest, NextResponse } from 'next/server';
import { jsonErr } from '@/lib/api/envelope';
import { synthesizeStaffTtsMp3, type ServerTtsLocale } from '@/lib/chat/serverTts';

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonErr('VALIDATION_ERROR', 'JSON body 필요', 400);
  }

  const o = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const text = String(o.text || '').trim();
  const locale = o.locale === 'ru' ? ('ru' as ServerTtsLocale) : null;

  if (!text) return jsonErr('VALIDATION_ERROR', 'text 필요', 400);
  if (!locale) return jsonErr('VALIDATION_ERROR', "locale must be 'ru'", 400);

  const result = await synthesizeStaffTtsMp3(text, locale);
  if (!result.ok) {
    const status = result.reason === 'missing_key' ? 503 : 500;
    const message =
      result.reason === 'missing_key'
        ? 'OpenAI API key not configured'
        : result.reason === 'empty_text'
          ? 'text 필요'
          : 'TTS synthesis failed';
    return jsonErr('TTS_UNAVAILABLE', message, status);
  }

  return new NextResponse(new Uint8Array(result.mp3), {
    status: 200,
    headers: {
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'private, max-age=3600',
      'X-TTS-Cache': result.cache === 'hit' ? 'HIT' : 'MISS'
    }
  });
}
