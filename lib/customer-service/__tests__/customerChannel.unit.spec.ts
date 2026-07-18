// Phase 1A unit tests — pure logic only (no DB). Run: `node --test` (Node ≥ 23.6).
// Imports use explicit .ts extensions so Node's type-stripping resolver finds them.
// DB-dependent repository behaviour is covered by the RLS SQL test (execution BLOCKED
// without a local Supabase) — see supabase/tests/customer_channel_rls.test.sql.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  generateRawCustomerToken,
  hashCustomerToken,
  tokensHashEqual,
  redactToken,
} from '../token.ts';
import {
  assertGuestPublicInvariant,
  assertSenderType,
  assertVisibility,
  assertRoomNo,
  assertLangCode,
  CustomerChannelValidationError,
} from '../validation.ts';

test('token: raw is high-entropy, url-safe, and unique', () => {
  const a = generateRawCustomerToken();
  const b = generateRawCustomerToken();
  assert.notEqual(a, b);
  assert.ok(a.length >= 40, 'expected >=40 chars (256-bit base64url)');
  assert.match(a, /^[A-Za-z0-9_-]+$/, 'base64url, no + / =');
});

test('token: hash is deterministic, one-way, and hex-64', () => {
  const raw = generateRawCustomerToken();
  const h1 = hashCustomerToken(raw);
  const h2 = hashCustomerToken(raw);
  assert.equal(h1, h2, 'deterministic');
  assert.notEqual(h1, raw, 'hash must differ from raw');
  assert.match(h1, /^[0-9a-f]{64}$/, 'sha-256 hex');
});

test('token: timing-safe compare is correct', () => {
  const raw = generateRawCustomerToken();
  const h = hashCustomerToken(raw);
  assert.equal(tokensHashEqual(h, h), true);
  assert.equal(tokensHashEqual(h, hashCustomerToken(generateRawCustomerToken())), false);
  assert.equal(tokensHashEqual(h, h.slice(0, 63)), false, 'length mismatch → false');
});

test('token: redact never reveals the full token', () => {
  const raw = generateRawCustomerToken();
  const r = redactToken(raw);
  assert.ok(!r.includes(raw.slice(3)), 'redaction must not contain the tail');
  assert.ok(r.length < raw.length);
});

test('validation: guest+internal invariant is rejected', () => {
  assert.throws(() => assertGuestPublicInvariant('guest', 'internal'), CustomerChannelValidationError);
  assert.doesNotThrow(() => assertGuestPublicInvariant('guest', 'public'));
  assert.doesNotThrow(() => assertGuestPublicInvariant('staff', 'internal'));
});

test('validation: enums reject unknown values', () => {
  assert.throws(() => assertSenderType('admin'), CustomerChannelValidationError);
  assert.throws(() => assertVisibility('secret'), CustomerChannelValidationError);
  assert.equal(assertSenderType('guest'), 'guest');
  assert.equal(assertVisibility('internal'), 'internal');
});

test('validation: room_no and lang bounds', () => {
  assert.throws(() => assertRoomNo(''), CustomerChannelValidationError);
  assert.equal(assertRoomNo(' 503 ').length, 3);
  assert.throws(() => assertLangCode('russian!'), CustomerChannelValidationError);
  assert.equal(assertLangCode('zh-CN'), 'zh-CN');
});
