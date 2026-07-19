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

// DEV = anything other than a production build. Diagnostics + the local session bypass
// are DEV-only; production (next start / Vercel) always enforces auth and logs nothing.
const isDev = process.env.NODE_ENV !== 'production';
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

/** DEV-only structured trace. NEVER logs the original text or the API key. */
function diag(reqId: string, fields: Record<string, unknown>) {
  if (isDev) console.log('[CUSTOMER_TRANSLATE_DIAG]', { reqId, ...fields });
}

function err(reqId: string, code: string, message: string, status: number, headers?: Record<string, string>) {
  diag(reqId, { phase: 'response', httpStatus: status, code });
  return NextResponse.json({ ok: false, error: { code, message } }, { status, headers });
}

export async function POST(req: NextRequest) {
  const reqId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

  // 1) Auth — valid staff session required in production. In DEV, a failed/missing session
  //    is bypassed so the real OpenAI path can be verified locally (no SERVICE_ROLE key).
  let accountId: string;
  try {
    const account = await validateSessionToken(bearerToken(req));
    accountId = account.accountId;
    diag(reqId, { phase: 'session', session: 'PASS' });
  } catch (e) {
    const name = e instanceof StaffAccountError ? e.message : e instanceof Error ? e.name : 'unknown';
    if (isDev) {
      diag(reqId, { phase: 'session', session: 'FAIL_DEV_BYPASS', reason: name });
      accountId = 'dev-bypass';
    } else {
      const status = e instanceof StaffAccountError ? (e.message === 'ACCOUNT_DEACTIVATED' ? 403 : 401) : 500;
      const code = e instanceof StaffAccountError ? e.message : 'AUTH_FAILED';
      return err(reqId, code, status === 500 ? '인증 확인에 실패했습니다.' : '로그인이 필요합니다.', status);
    }
  }

  // 2) Rate limit — per account (fallback IP).
  const rl = checkRateLimit(rateStore, accountId || clientIp(req), Date.now(), RATE_MAX, RATE_WINDOW_MS);
  if (!rl.allowed) {
    return err(reqId, 'RATE_LIMITED', '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.', 429, {
      'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)),
    });
  }

  // 3) Validate.
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return err(reqId, 'BAD_JSON', 'invalid JSON body', 400);
  }
  const v = validateTranslateRequest(raw);
  if (!v.ok) return err(reqId, v.code, v.message, v.status);
  if (v.sameLang) {
    diag(reqId, { phase: 'response', httpStatus: 200, sameLang: true });
    return NextResponse.json({ ok: true, translatedText: v.text });
  }

  // 4) Translate — server-only OPENAI_API_KEY via openAiCustomerTranslator.
  diag(reqId, { phase: 'openai_start', to: v.to, textLen: v.text.length, hasKey: Boolean(process.env.OPENAI_API_KEY) });
  try {
    const out = await openAiCustomerTranslator.translate(v.text, v.from, v.to);
    if (!out) {
      diag(reqId, { phase: 'openai_done', success: false, reason: 'null_missing_key_or_api_error_or_timeout' });
      return err(reqId, 'TRANSLATION_FAILED', '번역에 실패했습니다. 잠시 후 다시 시도해 주세요.', 502);
    }
    diag(reqId, { phase: 'openai_done', success: true, translatedLen: out.length });
    diag(reqId, { phase: 'response', httpStatus: 200 });
    return NextResponse.json({ ok: true, translatedText: out });
  } catch (e) {
    diag(reqId, { phase: 'openai_done', success: false, name: e instanceof Error ? e.name : 'unknown' });
    return err(reqId, 'TRANSLATION_ERROR', '번역 중 오류가 발생했습니다.', 500);
  }
}
