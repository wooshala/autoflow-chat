// Phase 1F.13 — pure request guards for the customer translate route. DOM/OpenAI-free
// so every branch is unit-testable under `node --test`. These replace the staff-session
// auth (removed in 1F.13): the translate route is protected by same-origin enforcement
// + per-IP rate limiting instead of a Bearer token, so a /chat user needs no extra login.
//
// Best-effort only (see checkRateLimit): serverless instances don't share the in-memory
// window, and Origin can be spoofed by non-browser clients. This blunts casual abuse and
// browser cross-origin calls — it is NOT a substitute for real auth on a public endpoint.

/**
 * Resolve the set of allowed origins. Priority:
 *   1. AUTOFLOW_ALLOWED_ORIGIN (comma-separated) when set — explicit allow-list.
 *   2. Otherwise the request's own origin (same-origin) — works on local + Preview
 *      with no env required.
 * Returned values are trimmed and empties dropped.
 */
export function resolveAllowedOrigins(opts: { envOrigin?: string | null; selfOrigin: string }): string[] {
  const env = String(opts.envOrigin ?? '').trim();
  if (env) {
    return env
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  const self = String(opts.selfOrigin ?? '').trim();
  return self ? [self] : [];
}

/**
 * True only when the request's Origin header exactly matches an allowed origin. A missing
 * or empty Origin (server-to-server / bare curl) is rejected — browsers always send Origin
 * on cross-origin AND same-origin non-GET requests, so a real /chat POST always has one.
 */
export function isOriginAllowed(originHeader: string | null | undefined, allowed: string[]): boolean {
  const origin = String(originHeader ?? '').trim();
  if (!origin) return false;
  return allowed.includes(origin);
}

/**
 * Extract a rate-limit key from the client IP. Priority: first x-forwarded-for entry,
 * then x-real-ip, then the literal 'local'. Never uses the raw header string as a key and
 * never returns an empty string. `get` is a header accessor (e.g. req.headers.get).
 */
export function extractClientIp(get: (name: string) => string | null | undefined): string {
  const xff = String(get('x-forwarded-for') ?? '').split(',')[0]?.trim();
  if (xff) return xff;
  const real = String(get('x-real-ip') ?? '').trim();
  if (real) return real;
  return 'local';
}
