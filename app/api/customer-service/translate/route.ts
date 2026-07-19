// Phase 1F.7 — customer-service translation API (SERVER). Translates a staff Korean
// reply into the guest language via the existing openAiCustomerTranslator. OPENAI_API_KEY
// is read server-side only (never NEXT_PUBLIC). Does NOT write to any DB.
//
// Gate: disabled unless CUSTOMER_TRANSLATE_ENABLED='1', so it is never a public,
// always-on translation proxy in an environment that hasn't deliberately enabled it.
// Contract: { text, from, to } → { ok:true, translatedText } | { ok:false, error:{code,message} }.

import { NextRequest, NextResponse } from 'next/server';

import { openAiCustomerTranslator } from '@/lib/customer-service/translation';
import { validateTranslateRequest } from '@/lib/customer-service/translateRequest';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const isDev = process.env.NODE_ENV === 'development';

export async function POST(req: NextRequest) {
  if (process.env.CUSTOMER_TRANSLATE_ENABLED !== '1') {
    return NextResponse.json(
      { ok: false, error: { code: 'DISABLED', message: 'customer translation is not enabled' } },
      { status: 404 },
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: { code: 'BAD_JSON', message: 'invalid JSON body' } }, { status: 400 });
  }

  const v = validateTranslateRequest(raw);
  if (!v.ok) {
    return NextResponse.json({ ok: false, error: { code: v.code, message: v.message } }, { status: v.status });
  }

  // No API call needed when languages match.
  if (v.sameLang) {
    return NextResponse.json({ ok: true, translatedText: v.text });
  }

  try {
    const out = await openAiCustomerTranslator.translate(v.text, v.from, v.to);
    if (!out) {
      // openAiCustomerTranslator returns null on missing key / API error / timeout / empty.
      if (isDev) console.log('[CUSTOMER_TRANSLATE_API_FAIL]', { from: v.from, to: v.to, len: v.text.length });
      return NextResponse.json(
        { ok: false, error: { code: 'TRANSLATION_FAILED', message: '번역에 실패했습니다. 잠시 후 다시 시도해 주세요.' } },
        { status: 502 },
      );
    }
    return NextResponse.json({ ok: true, translatedText: out });
  } catch (err) {
    // Safety net — never leak an internal stack; log metadata only (no full text).
    if (isDev) {
      console.log('[CUSTOMER_TRANSLATE_API_ERROR]', {
        from: v.from,
        to: v.to,
        len: v.text.length,
        name: err instanceof Error ? err.name : 'unknown',
      });
    }
    return NextResponse.json(
      { ok: false, error: { code: 'TRANSLATION_ERROR', message: '번역 중 오류가 발생했습니다.' } },
      { status: 500 },
    );
  }
}
