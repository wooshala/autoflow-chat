// Phase 1F.9 — rate limiter tests.
// Run: node --test lib/customer-service/__tests__/rateLimit.spec.ts

import test from 'node:test';
import assert from 'node:assert/strict';

import { checkRateLimit } from '../rateLimit.ts';

test('allows up to max within the window, then blocks', () => {
  const store = new Map<string, number[]>();
  const now = 1_000_000;
  for (let i = 0; i < 3; i++) {
    const d = checkRateLimit(store, 'u1', now + i, 3, 60_000);
    assert.equal(d.allowed, true, `hit ${i} allowed`);
  }
  const blocked = checkRateLimit(store, 'u1', now + 3, 3, 60_000);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.ok(blocked.retryAfterMs > 0);
});

test('window slides — old hits expire', () => {
  const store = new Map<string, number[]>();
  checkRateLimit(store, 'u1', 0, 1, 1000);
  assert.equal(checkRateLimit(store, 'u1', 500, 1, 1000).allowed, false, 'still within window');
  assert.equal(checkRateLimit(store, 'u1', 1500, 1, 1000).allowed, true, 'previous hit expired');
});

test('keys are independent', () => {
  const store = new Map<string, number[]>();
  assert.equal(checkRateLimit(store, 'a', 0, 1, 1000).allowed, true);
  assert.equal(checkRateLimit(store, 'b', 0, 1, 1000).allowed, true, 'different key not limited');
  assert.equal(checkRateLimit(store, 'a', 1, 1, 1000).allowed, false, 'same key limited');
});
