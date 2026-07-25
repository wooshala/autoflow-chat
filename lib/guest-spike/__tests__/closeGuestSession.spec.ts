// Staff close DELETE response parsing — must reject non-2xx so UI never treats failure as success.
// Run: node --test lib/guest-spike/__tests__/closeGuestSession.spec.ts
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CLOSE_SESSION_FAILED_USER_MESSAGE,
  parseCloseSessionHttpResult,
} from '../closeSessionResponse.ts';

test('200 + closed_count 1 → success result', () => {
  const r = parseCloseSessionHttpResult(200, {
    ok: true,
    closed: true,
    closed_count: 1,
    closed_session_ids: ['s1'],
  });
  assert.equal(r.closed, true);
  assert.equal(r.closed_count, 1);
  assert.deepEqual(r.closed_session_ids, ['s1']);
});

test('200 + closed_count 0 (idle) → resolves, not an error', () => {
  const r = parseCloseSessionHttpResult(200, { ok: true, closed: false, closed_count: 0, closed_session_ids: [] });
  assert.equal(r.closed, false);
  assert.equal(r.closed_count, 0);
});

test('401 rejects (does not swallow)', () => {
  assert.throws(() => parseCloseSessionHttpResult(401, { ok: false, error: 'UNAUTHORIZED' }), /CLOSE_SESSION_FAILED_401/);
});

test('403 rejects', () => {
  assert.throws(() => parseCloseSessionHttpResult(403, {}), /CLOSE_SESSION_FAILED_403/);
});

test('500 rejects', () => {
  assert.throws(() => parseCloseSessionHttpResult(500, 'DB_ERROR'), /CLOSE_SESSION_FAILED_500/);
});

test('user-facing close failure copy has no tokens or status codes', () => {
  assert.match(CLOSE_SESSION_FAILED_USER_MESSAGE, /대화를 종료하지 못했습니다/);
  assert.doesNotMatch(CLOSE_SESSION_FAILED_USER_MESSAGE, /401|500|Bearer|token|UNAUTHORIZED/i);
});
