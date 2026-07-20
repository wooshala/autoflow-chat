// Phase 1H.7 — guest session cookie contract. 30-day Max-Age so a guest is NEVER locked out of
// their OWN chat by cookie expiry mid-stay; access revocation is DB-driven (status='closed'),
// not cookie expiry. Runs under `node --test` (sessionCookie only imports node:crypto).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SESSION_COOKIE_MAX_AGE, channelCookieName, sessionCookieOptions } from '../sessionCookie.ts';

test('Max-Age is 30 days (not a short 12h that would lock guests out mid-stay)', () => {
  assert.equal(SESSION_COOKIE_MAX_AGE, 60 * 60 * 24 * 30);
  assert.equal(SESSION_COOKIE_MAX_AGE, 2_592_000);
});

test('cookie options are HttpOnly + SameSite=Lax + Path=/ with the 30-day Max-Age (persistent, not a session cookie)', () => {
  const o = sessionCookieOptions();
  assert.equal(o.httpOnly, true);
  assert.equal(o.sameSite, 'lax');
  assert.equal(o.path, '/');
  assert.equal(o.maxAge, 60 * 60 * 24 * 30);
  // A persistent cookie MUST carry a Max-Age (a session/browser-close cookie would drop too
  // easily on mobile in-app browsers).
  assert.equal(typeof o.maxAge, 'number');
  assert.ok(o.maxAge > 0);
});

test('cookie name is per-channel, server-derived, and format-safe (afg_sid_ + 16 hex)', () => {
  const a = channelCookieName('room-308');
  const b = channelCookieName('room-309');
  assert.match(a, /^afg_sid_[0-9a-f]{16}$/);
  assert.notEqual(a, b); // different channels → different cookie names
  assert.equal(channelCookieName('room-308'), a); // stable/deterministic
});
