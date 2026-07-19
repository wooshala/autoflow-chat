// Phase 1F.7 — client translator tests (injected fake fetch).
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

const fetchReturning = (res: Response): typeof fetch => (async () => res) as unknown as typeof fetch;

test('success → returns translatedText', async () => {
  const out = await translateCustomerReply('안녕하세요', 'ko', 'ja', {
    fetchImpl: fetchReturning(jsonResponse(200, { ok: true, translatedText: 'こんにちは' })),
  });
  assert.equal(out, 'こんにちは');
});

test('from === to → returns original, no fetch', async () => {
  let called = false;
  const out = await translateCustomerReply('hi', 'en', 'en', {
    fetchImpl: (async () => {
      called = true;
      return jsonResponse(200, { ok: true, translatedText: 'x' });
    }) as unknown as typeof fetch,
  });
  assert.equal(out, 'hi');
  assert.equal(called, false);
});

test('empty text → throws EMPTY_TEXT', async () => {
  await assert.rejects(() => translateCustomerReply('   ', 'ko', 'ja'), /EMPTY_TEXT/);
});

test('non-2xx → throws HTTP_<status>', async () => {
  await assert.rejects(
    () => translateCustomerReply('안녕', 'ko', 'ja', { fetchImpl: fetchReturning(jsonResponse(502, { ok: false })) }),
    /HTTP_502/,
  );
});

test('ok:false → throws error code', async () => {
  await assert.rejects(
    () =>
      translateCustomerReply('안녕', 'ko', 'ja', {
        fetchImpl: fetchReturning(jsonResponse(200, { ok: false, error: { code: 'TRANSLATION_FAILED' } })),
      }),
    /TRANSLATION_FAILED/,
  );
});

test('malformed JSON → throws MALFORMED_JSON', async () => {
  await assert.rejects(
    () => translateCustomerReply('안녕', 'ko', 'ja', { fetchImpl: fetchReturning(jsonResponse(200, null, true)) }),
    /MALFORMED_JSON/,
  );
});

test('ok:true but missing translatedText → throws', async () => {
  await assert.rejects(
    () => translateCustomerReply('안녕', 'ko', 'ja', { fetchImpl: fetchReturning(jsonResponse(200, { ok: true })) }),
    /TRANSLATION_FAILED/,
  );
});
