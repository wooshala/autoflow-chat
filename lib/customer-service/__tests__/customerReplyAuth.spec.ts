// Phase 1F.12 — pure auth-decision tests for the customer reply composer.
// Run: node --test lib/customer-service/__tests__/customerReplyAuth.spec.ts

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyTranslateFailure,
  decidePublicSend,
  parseStaffLoginResponse,
  staffLoginErrorMessage,
} from '../customerReplyAuth.ts';

// --- decidePublicSend: gates the translate call BEFORE any network request ---

test('no body → ignore (nothing to translate)', () => {
  assert.equal(decidePublicSend({ hasBody: false, hasStaffToken: true }), 'ignore');
  assert.equal(decidePublicSend({ hasBody: false, hasStaffToken: false }), 'ignore');
});

test('session 없음 + body → need-auth (caller must make 0 API calls)', () => {
  assert.equal(decidePublicSend({ hasBody: true, hasStaffToken: false }), 'need-auth');
});

test('session present + body → translate', () => {
  assert.equal(decidePublicSend({ hasBody: true, hasStaffToken: true }), 'translate');
});

// --- classifyTranslateFailure: 401 → session-expired, everything else → failed ---

test('HTTP_401 rejection → session-expired', () => {
  assert.equal(classifyTranslateFailure(new Error('HTTP_401')), 'session-expired');
});

test('other rejections → translation-failed', () => {
  assert.equal(classifyTranslateFailure(new Error('HTTP_429')), 'translation-failed');
  assert.equal(classifyTranslateFailure(new Error('TRANSLATION_FAILED')), 'translation-failed');
  assert.equal(classifyTranslateFailure(new Error('MALFORMED_JSON')), 'translation-failed');
  assert.equal(classifyTranslateFailure('HTTP_500'), 'translation-failed');
  assert.equal(classifyTranslateFailure(null), 'translation-failed');
});

// --- parseStaffLoginResponse: success drives saveStaffSession; failure keeps draft ---

test('success envelope → ok with token + account', () => {
  const parsed = parseStaffLoginResponse(
    { ok: true },
    { ok: true, data: { sessionToken: 'RAW_TOKEN', account: { accountId: 'a1', userId: 'u1', displayName: '홍길동' } } },
  );
  assert.deepEqual(parsed, {
    ok: true,
    sessionToken: 'RAW_TOKEN',
    account: { accountId: 'a1', userId: 'u1', displayName: '홍길동' },
  });
});

test('error envelope → not ok, surfaces error code', () => {
  const parsed = parseStaffLoginResponse({ ok: false }, { ok: false, error: 'LOGIN_CODE_INVALID' });
  assert.equal(parsed.ok, false);
  assert.equal((parsed as { errorCode: string }).errorCode, 'LOGIN_CODE_INVALID');
});

test('missing token/account → not ok (never saves a bogus session)', () => {
  assert.equal(parseStaffLoginResponse({ ok: true }, { ok: true, data: { account: { accountId: 'a', userId: 'u' } } }).ok, false);
  assert.equal(parseStaffLoginResponse({ ok: true }, { ok: true, data: { sessionToken: 'T' } }).ok, false);
  assert.equal(parseStaffLoginResponse({ ok: true }, null).ok, false);
});

// --- staffLoginErrorMessage: generic, no internal DB detail leaked ---

test('login-locked → throttle message', () => {
  assert.match(staffLoginErrorMessage('LOGIN_LOCKED'), /잠시/);
});

test('unknown / wrong code → generic message (no account-existence leak)', () => {
  assert.equal(staffLoginErrorMessage('LOGIN_CODE_INVALID'), '코드가 올바르지 않습니다.');
  assert.equal(staffLoginErrorMessage('ACCOUNT_NOT_FOUND'), '코드가 올바르지 않습니다.');
  assert.equal(staffLoginErrorMessage(undefined), '코드가 올바르지 않습니다.');
});
