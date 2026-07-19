// Phase 1F.9 — customer-service translation API (SERVER). Translates a staff Korean reply
// into the guest language via the existing openAiCustomerTranslator. OPENAI_API_KEY is
// read server-side only (never NEXT_PUBLIC). Does NOT write to any DB.
//
// Security (not a flag-only gate):
//   1) Auth — requires a valid staff account session (Authorization: Bearer <token>),
//      validated by the existing validateSessionToken. Never an anonymous public proxy.
//   2) Rate limit — per account (fallback IP), best-effort in-memory sliding window.
//   3) Input validation — text non-empty & ≤2000, from/to are supported lang codes.
// Contract: { text, from, to } → { ok:true, translatedText } | { ok:false, error:{code,message} }.

import { NextRequest, NextResponse } from 'next/server';

import { StaffAccountError, validateSessionToken } from '@/lib/services/staffAccounts';
import { openAiCustomerTranslator } from '@/lib/customer-service/translation';
import { validateTranslateRequest } from '@/lib/customer-service/translateRequest';
import { checkRateLimit } from '@/lib/customer-service/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const isDev = process.env.NODE_ENV === 'development';
const RATE_MAX = 20;
const RATE_WINDOW_MS = 60_000;
const rateStore = new Map<string, number[]>();

function bearerToken(req: NextRequest): string {
  const h = req.headers.get('authorization') || '';
  return h.toLowerCase().startsWith('bearer ') ? h.slice(7).trim() : '';
}

function clientIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

function err(code: string, message: string, status: number, headers?: Record<string, string>) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status, headers });
}

export async function POST(req: NextRequest) {
  // 1) Auth — valid staff session required.
  let accountId: string;
  try {
    const account = await validateSessionToken(bearerToken(req));
    accountId = account.accountId;
  } catch (e) {
    if (e instanceof StaffAccountError) {
      const status = e.message === 'ACCOUNT_DEACTIVATED' ? 403 : 401;
      return err(e.message, '로그인이 필요합니다.', status);
    }
    if (isDev) console.log('[CUSTOMER_TRANSLATE_AUTH_ERROR]', { name: e instanceof Error ? e.name : 'unknown' });
    return err('AUTH_FAILED', '인증 확인에 실패했습니다.', 500);
  }

  // 2) Rate limit — per account (fallback IP).
  const rl = checkRateLimit(rateStore, accountId || clientIp(req), Date.now(), RATE_MAX, RATE_WINDOW_MS);
  if (!rl.allowed) {
    return err('RATE_LIMITED', '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.', 429, {
      'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)),
    });
  }

  // 3) Validate.
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return err('BAD_JSON', 'invalid JSON body', 400);
  }
  const v = validateTranslateRequest(raw);
  if (!v.ok) return err(v.code, v.message, v.status);
  if (v.sameLang) return NextResponse.json({ ok: true, translatedText: v.text });

  // 4) Translate — server-only OPENAI_API_KEY via openAiCustomerTranslator.
  try {
    const out = await openAiCustomerTranslator.translate(v.text, v.from, v.to);
    if (!out) {
      if (isDev) console.log('[CUSTOMER_TRANSLATE_API_FAIL]', { from: v.from, to: v.to, len: v.text.length });
      return err('TRANSLATION_FAILED', '번역에 실패했습니다. 잠시 후 다시 시도해 주세요.', 502);
    }
    return NextResponse.json({ ok: true, translatedText: out });
  } catch (e) {
    if (isDev) {
      console.log('[CUSTOMER_TRANSLATE_API_ERROR]', {
        from: v.from,
        to: v.to,
        len: v.text.length,
        name: e instanceof Error ? e.name : 'unknown',
      });
    }
    return err('TRANSLATION_ERROR', '번역 중 오류가 발생했습니다.', 500);
  }
}
