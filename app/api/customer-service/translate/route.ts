// Phase 1F.13 — customer-service translation API (SERVER). Translates a staff Korean reply
// into the guest language via the existing openAiCustomerTranslator. OPENAI_API_KEY is
// read server-side only (never NEXT_PUBLIC). Does NOT write to any DB.
//
// Auth model (1F.13): NO staff-session Bearer token. A user already inside /chat can
// translate without an extra login. The route is protected — not a fully public proxy —
// by two best-effort guards:
//   1) Origin — same-origin browser requests only (cross-origin / no-Origin → 403).
//   2) Rate limit — per client IP, in-memory sliding window (best-effort, per-process).
//   3) Input validation — text non-empty & ≤2000, from/to are supported lang codes.
// Contract: { text, from, to } → { ok:true, translatedText } | { ok:false, error:{code,message} }.

import { NextRequest, NextResponse } from 'next/server';

import { openAiCustomerTranslator } from '@/lib/customer-service/translation';
import { validateTranslateRequest } from '@/lib/customer-service/translateRequest';
import { checkRateLimit } from '@/lib/customer-service/rateLimit';
import { extractClientIp, isOriginAllowed, resolveAllowedOrigins } from '@/lib/customer-service/requestGuard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const RATE_MAX = 20;
const RATE_WINDOW_MS = 60_000;
const rateStore = new Map<string, number[]>();

function err(code: string, message: string, status: number, headers?: Record<string, string>) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status, headers });
}

/** The request's own origin, from forwarded proxy headers when present (Preview/Prod),
 *  falling back to nextUrl.origin (local dev). Used as the default same-origin allow. */
function selfOrigin(req: NextRequest): string {
  const proto = (req.headers.get('x-forwarded-proto') ?? '').split(',')[0]?.trim();
  const host = (req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? '').split(',')[0]?.trim();
  if (proto && host) return `${proto}://${host}`;
  return req.nextUrl.origin;
}

export async function POST(req: NextRequest) {
  // 1) Origin — same-origin browser requests only. No Bearer token, no session lookup.
  const allowed = resolveAllowedOrigins({
    envOrigin: process.env.AUTOFLOW_ALLOWED_ORIGIN,
    selfOrigin: selfOrigin(req),
  });
  if (!isOriginAllowed(req.headers.get('origin'), allowed)) {
    return err('FORBIDDEN_ORIGIN', '허용되지 않은 요청입니다.', 403);
  }

  // 2) Rate limit — per client IP (best-effort, in-memory). Never logs the full IP.
  const ip = extractClientIp((n) => req.headers.get(n));
  const rl = checkRateLimit(rateStore, ip, Date.now(), RATE_MAX, RATE_WINDOW_MS);
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
  if (v.sameLang) {
    return NextResponse.json({ ok: true, translatedText: v.text });
  }

  // 4) Translate — server-only OPENAI_API_KEY via openAiCustomerTranslator.
  try {
    const out = await openAiCustomerTranslator.translate(v.text, v.from, v.to);
    if (!out) {
      return err('TRANSLATION_FAILED', '번역에 실패했습니다. 잠시 후 다시 시도해 주세요.', 502);
    }
    return NextResponse.json({ ok: true, translatedText: out });
  } catch {
    return err('TRANSLATION_ERROR', '번역 중 오류가 발생했습니다.', 500);
  }
}
