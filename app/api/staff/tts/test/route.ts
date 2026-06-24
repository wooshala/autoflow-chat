import { NextRequest, NextResponse } from 'next/server';
import { jsonErr } from '@/lib/api/envelope';
import { synthesizeStaffTtsMp3 } from '@/lib/chat/serverTts';

export async function GET(req: NextRequest) {
  const text = String(req.nextUrl.searchParams.get('text') || 'Тест').trim();
  const result = await synthesizeStaffTtsMp3(text, 'ru');

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
      'Cache-Control': 'no-store',
      'X-TTS-Cache': result.cache === 'hit' ? 'HIT' : 'MISS'
    }
  });
}
