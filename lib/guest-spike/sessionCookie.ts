// Phase 1H.7 — server-only cookie helpers for the guest session. The cookie NAME is
// per-channel (a short SHA-256 of channel_key, so no raw/special chars, stable format);
// the VALUE is the session id. HttpOnly + Secure(prod) + SameSite=Lax + Path=/ + Max-Age.
// The name is derived ONLY here (never assembled by client code).

import { createHash } from 'node:crypto';

// 30 days — long enough that a guest is NEVER locked out of their OWN chat by cookie
// expiry during a stay (incl. multi-night). Access revocation is DB-driven (status='closed'),
// NOT cookie expiry: a closed session's cookie only ever points at a closed session, so an
// ex-guest can never reach the next guest's chat. NEVER use a session (browser-close) cookie —
// mobile in-app browsers / memory pressure drop those far too easily.
export const SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export function channelCookieName(channelKey: string): string {
  return 'afg_sid_' + createHash('sha256').update(channelKey).digest('hex').slice(0, 16);
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: SESSION_COOKIE_MAX_AGE,
  };
}
