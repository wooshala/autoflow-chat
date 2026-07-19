// Phase 1F.9 — client translator tests (injected fake fetch + authHeaders).
// Run: node --test lib/customer-service/__tests__/apiCustomerTranslator.spec.ts

import test from 'node:test';
import assert from 'node:assert/strict';

import { translateCustomerReply } from '../apiCustomerTranslator.ts';

const jsonResponse = (status: number, body: unknown, malformed = false): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (malformed) throw new Error('bad json');
      return body;
    },
  }) as unknown as Response;

// authHeaders:{} avoids calling staffSessionAuthHeaders() (no localStorage in Node).
const base = { authHeaders: {} as Record<string, string> };
const withFetch = (res: Response) => ({ ...base, fetchImpl: (async () => res) as unknown as typeof fetch });

test('success → returns translatedText', async () => {
  const out = await translateCustomerReply('안녕하세요', 'ko', 'ja', withFetch(jsonResponse(200, { ok: true, translatedText: 'こんにちは' })));
  assert.equal(out, 'こんにちは');
});

test('sends Authorization header when provided', async () => {
  let sentAuth: string | undefined;
  await translateCustomerReply('안녕', 'ko', 'ja', {
    authHeaders: { Authorization: 'Bearer T' },
    fetchImpl: (async (_url: string, init: RequestInit) => {
      sentAuth = (init.headers as Record<string, string>).Authorization;
      return jsonResponse(200, { ok: true, translatedText: 'x' });
    }) as unknown as typeof fetch,
  });
  assert.equal(sentAuth, 'Bearer T');
});

test('from === to → original, no fetch', async () => {
  let called = false;
  const out = await translateCustomerReply('hi', 'en', 'en', {
    ...base,
    fetchImpl: (async () => {
      called = true;
      return jsonResponse(200, { ok: true, translatedText: 'x' });
    }) as unknown as typeof fetch,
  });
  assert.equal(out, 'hi');
  assert.equal(called, false);
});

test('empty text → throws EMPTY_TEXT', async () => {
  await assert.rejects(() => translateCustomerReply('  ', 'ko', 'ja', base), /EMPTY_TEXT/);
});

test('401 (no session) → throws HTTP_401', async () => {
  await assert.rejects(() => translateCustomerReply('안녕', 'ko', 'ja', withFetch(jsonResponse(401, { ok: false }))), /HTTP_401/);
});

test('429 (rate limited) → throws HTTP_429', async () => {
  await assert.rejects(() => translateCustomerReply('안녕', 'ko', 'ja', withFetch(jsonResponse(429, { ok: false }))), /HTTP_429/);
});

test('ok:false → throws error code', async () => {
  await assert.rejects(
    () => translateCustomerReply('안녕', 'ko', 'ja', withFetch(jsonResponse(200, { ok: false, error: { code: 'TRANSLATION_FAILED' } }))),
    /TRANSLATION_FAILED/,
  );
});

test('malformed JSON → throws MALFORMED_JSON', async () => {
  await assert.rejects(() => translateCustomerReply('안녕', 'ko', 'ja', withFetch(jsonResponse(200, null, true))), /MALFORMED_JSON/);
});
