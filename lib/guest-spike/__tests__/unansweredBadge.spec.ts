// Phase GC-Notification — unit tests for Room Nav unanswered badge helpers.
// Run: node --import tsx --test lib/guest-spike/__tests__/unansweredBadge.spec.ts

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  formatUnansweredBadgeCount,
  isUnansweredStale,
  UNANSWERED_STALE_MS,
} from '../unansweredBadge.ts';

describe('formatUnansweredBadgeCount', () => {
  it('shows 1–99 as digits', () => {
    assert.equal(formatUnansweredBadgeCount(1), '1');
    assert.equal(formatUnansweredBadgeCount(2), '2');
    assert.equal(formatUnansweredBadgeCount(99), '99');
  });

  it('caps at 99+', () => {
    assert.equal(formatUnansweredBadgeCount(100), '99+');
    assert.equal(formatUnansweredBadgeCount(999), '99+');
  });

  it('hides non-positive / invalid', () => {
    assert.equal(formatUnansweredBadgeCount(0), '');
    assert.equal(formatUnansweredBadgeCount(-1), '');
    assert.equal(formatUnansweredBadgeCount(NaN), '');
  });
});

describe('isUnansweredStale', () => {
  it('is fresh under 24h', () => {
    const now = Date.parse('2026-08-02T12:00:00.000Z');
    const first = new Date(now - UNANSWERED_STALE_MS + 60_000).toISOString();
    assert.equal(isUnansweredStale(first, now), false);
  });

  it('is stale at/after 24h', () => {
    const now = Date.parse('2026-08-02T12:00:00.000Z');
    const exact = new Date(now - UNANSWERED_STALE_MS).toISOString();
    const older = new Date(now - UNANSWERED_STALE_MS - 1).toISOString();
    assert.equal(isUnansweredStale(exact, now), true);
    assert.equal(isUnansweredStale(older, now), true);
  });

  it('rejects bad timestamps', () => {
    assert.equal(isUnansweredStale('not-a-date'), false);
  });
});
