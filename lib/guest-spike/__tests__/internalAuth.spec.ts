// Phase 2D — internal service auth for the guest-chat feeds. fail-closed, Bearer only,
// no fallback onto INTERNAL_EVENTS_SECRET or the Supabase service-role key.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { authorizeInternalRequest, GUEST_CHAT_INTERNAL_SECRET_ENV } from '../internalAuth.ts';

/** Minimal NextRequest stand-in: authorizeInternalRequest only reads headers. */
const reqWith = (authorization?: string) =>
  ({
    headers: { get: (k: string) => (k.toLowerCase() === 'authorization' ? authorization ?? null : null) },
  }) as unknown as Parameters<typeof authorizeInternalRequest>[0];

function withSecret<T>(value: string | undefined, fn: () => T): T {
  const prev = process.env[GUEST_CHAT_INTERNAL_SECRET_ENV];
  if (value === undefined) delete process.env[GUEST_CHAT_INTERNAL_SECRET_ENV];
  else process.env[GUEST_CHAT_INTERNAL_SECRET_ENV] = value;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env[GUEST_CHAT_INTERNAL_SECRET_ENV];
    else process.env[GUEST_CHAT_INTERNAL_SECRET_ENV] = prev;
  }
}

// ── 1. secret 없음 → 401 ──────────────────────────────────────────────
test('missing Bearer is rejected', () => {
  withSecret('s3cret', () => {
    assert.deepEqual(authorizeInternalRequest(reqWith(undefined)), {
      ok: false,
      reason: 'unauthorized',
    });
  });
});

// ── 2. 틀린 secret → 401 ──────────────────────────────────────────────
test('wrong secret is rejected', () => {
  withSecret('s3cret', () => {
    assert.deepEqual(authorizeInternalRequest(reqWith('Bearer nope')), {
      ok: false,
      reason: 'unauthorized',
    });
  });
});

test('a longer/shorter presented secret is rejected without throwing', () => {
  withSecret('s3cret', () => {
    assert.equal(authorizeInternalRequest(reqWith('Bearer s3cretXXXX')).ok, false);
    assert.equal(authorizeInternalRequest(reqWith('Bearer s3c')).ok, false);
  });
});

// ── 3. 맞는 secret → 200 ──────────────────────────────────────────────
test('matching secret is accepted, case-insensitive scheme', () => {
  withSecret('s3cret', () => {
    assert.deepEqual(authorizeInternalRequest(reqWith('Bearer s3cret')), { ok: true });
    assert.deepEqual(authorizeInternalRequest(reqWith('bearer s3cret')), { ok: true });
  });
});

// ── 4. env 미설정 → not_configured (라우트가 500 으로 변환) ───────────
test('fail-closed when the secret is not configured', () => {
  withSecret(undefined, () => {
    assert.deepEqual(authorizeInternalRequest(reqWith('Bearer anything')), {
      ok: false,
      reason: 'not_configured',
    });
  });
});

test('an empty or whitespace secret never authorizes', () => {
  withSecret('', () => {
    assert.equal(authorizeInternalRequest(reqWith('Bearer ')).reason, 'not_configured');
  });
  withSecret('   ', () => {
    assert.equal(authorizeInternalRequest(reqWith('Bearer    ')).reason, 'not_configured');
  });
});

test('non-Bearer schemes are rejected', () => {
  withSecret('s3cret', () => {
    assert.equal(authorizeInternalRequest(reqWith('Basic s3cret')).ok, false);
    assert.equal(authorizeInternalRequest(reqWith('s3cret')).ok, false);
  });
});
