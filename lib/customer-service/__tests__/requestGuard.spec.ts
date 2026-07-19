// Phase 1F.13 — pure request-guard tests for the customer translate route.
// Run: node --test lib/customer-service/__tests__/requestGuard.spec.ts

import test from 'node:test';
import assert from 'node:assert/strict';

import { extractClientIp, isOriginAllowed, resolveAllowedOrigins } from '../requestGuard.ts';

// --- resolveAllowedOrigins: env allow-list wins, else same-origin fallback ---

test('env origin present → used (comma-split, trimmed)', () => {
  assert.deepEqual(
    resolveAllowedOrigins({ envOrigin: 'https://a.com, https://b.com ', selfOrigin: 'http://localhost:3000' }),
    ['https://a.com', 'https://b.com'],
  );
});

test('no env → falls back to same-origin (no env required locally)', () => {
  assert.deepEqual(
    resolveAllowedOrigins({ envOrigin: undefined, selfOrigin: 'http://localhost:3000' }),
    ['http://localhost:3000'],
  );
  assert.deepEqual(resolveAllowedOrigins({ envOrigin: '   ', selfOrigin: 'http://localhost:3000' }), [
    'http://localhost:3000',
  ]);
});

// --- isOriginAllowed: exact same-origin only; missing/other → reject ---

test('same origin → allowed', () => {
  assert.equal(isOriginAllowed('http://localhost:3000', ['http://localhost:3000']), true);
});

test('different origin → rejected', () => {
  assert.equal(isOriginAllowed('http://evil.com', ['http://localhost:3000']), false);
});

test('missing / empty Origin (bare curl, server-to-server) → rejected', () => {
  assert.equal(isOriginAllowed(null, ['http://localhost:3000']), false);
  assert.equal(isOriginAllowed(undefined, ['http://localhost:3000']), false);
  assert.equal(isOriginAllowed('   ', ['http://localhost:3000']), false);
});

test('production self-origin matches its own /chat', () => {
  const allowed = resolveAllowedOrigins({ envOrigin: null, selfOrigin: 'https://autoflow.example.app' });
  assert.equal(isOriginAllowed('https://autoflow.example.app', allowed), true);
  assert.equal(isOriginAllowed('https://phishy.example.app', allowed), false);
});

// --- extractClientIp: xff first → x-real-ip → 'local' ---

test('x-forwarded-for → first entry, trimmed', () => {
  const get = (n) => (n === 'x-forwarded-for' ? ' 203.0.113.7 , 10.0.0.1 ' : null);
  assert.equal(extractClientIp(get), '203.0.113.7');
});

test('no xff → x-real-ip', () => {
  const get = (n) => (n === 'x-real-ip' ? '198.51.100.9' : null);
  assert.equal(extractClientIp(get), '198.51.100.9');
});

test('no ip headers → local (never empty)', () => {
  assert.equal(extractClientIp(() => null), 'local');
  assert.equal(extractClientIp((n) => (n === 'x-forwarded-for' ? '   ' : '')), 'local');
});
