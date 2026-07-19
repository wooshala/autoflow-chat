// Phase 1F.7 — translate request validation tests.
// Run: node --test lib/customer-service/__tests__/translateRequest.spec.ts

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  validateTranslateRequest,
  MAX_TRANSLATE_TEXT_LEN,
} from '../translateRequest.ts';

test('valid request → ok with trimmed text', () => {
  const r = validateTranslateRequest({ text: '  안녕하세요 ', from: 'ko', to: 'ja' });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.text, '안녕하세요');
    assert.equal(r.from, 'ko');
    assert.equal(r.to, 'ja');
    assert.equal(r.sameLang, false);
  }
});

test('from === to → sameLang true (route returns original, no API call)', () => {
  const r = validateTranslateRequest({ text: 'hi', from: 'en', to: 'en' });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.sameLang, true);
});

test('empty / whitespace text → 400 VALIDATION_ERROR', () => {
  for (const text of ['', '   ', undefined, 123]) {
    const r = validateTranslateRequest({ text, from: 'ko', to: 'ja' });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.code, 'VALIDATION_ERROR');
      assert.equal(r.status, 400);
    }
  }
});

test('text over max length → 400 TEXT_TOO_LONG', () => {
  const r = validateTranslateRequest({ text: 'x'.repeat(MAX_TRANSLATE_TEXT_LEN + 1), from: 'ko', to: 'ja' });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.code, 'TEXT_TOO_LONG');
    assert.equal(r.status, 400);
  }
});

test('unsupported language → 400 UNSUPPORTED_LANGUAGE', () => {
  for (const [from, to] of [['ko', 'de'], ['xx', 'ja'], ['ko', '日本語']]) {
    const r = validateTranslateRequest({ text: '안녕', from, to });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.code, 'UNSUPPORTED_LANGUAGE');
      assert.equal(r.status, 400);
    }
  }
});

test('null/garbage body → 400 (not a crash)', () => {
  assert.equal(validateTranslateRequest(null).ok, false);
  assert.equal(validateTranslateRequest('nope').ok, false);
});
