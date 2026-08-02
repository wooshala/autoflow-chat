// Phase 2A' — the guest messages route must derive `sender` from the authenticated context,
// never from the request body. A cookie-holding guest posting {"sender":"staff"} previously
// stored a staff message, which silently cleared that room's unanswered state.
//
// The POST handler needs Supabase + an LLM translation call, so this pins the contract at the
// source level instead of booting the route.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = readFileSync(
  fileURLToPath(new URL('../../../app/api/guest/[channel_key]/messages/route.ts', import.meta.url)),
  'utf8',
);

/** Comments describe the old vulnerable code, so assertions must run against code only. */
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const post = stripComments(src.slice(src.indexOf('export async function POST')));

test('sender is never read from the request body', () => {
  assert.equal(/sender\s*=\s*body\.sender/.test(post), false);
  assert.equal(/body\.sender\s*===\s*['"]staff['"]/.test(post), false);
  assert.equal(/body\.sender/.test(post), false);
});

test('sender is derived from the ?as=staff authenticated branch', () => {
  assert.match(post, /sender\s*=\s*req\.nextUrl\.searchParams\.get\('as'\)\s*===\s*'staff'/);
});

test('sender is assigned only after resolveSession succeeded', () => {
  const resolveAt = post.indexOf('await resolveSession');
  const assignAt = post.search(/sender\s*=\s*req\.nextUrl\.searchParams/);
  assert.ok(resolveAt > -1 && assignAt > resolveAt, 'sender must be set after the auth gate');
});

test('the body sender field is still tolerated (no breaking change)', () => {
  // Accepted and ignored: old clients keep sending it.
  assert.match(src, /sender\?:\s*unknown/);
});

test('raw body / sender is not logged', () => {
  assert.equal(/console\.\w+\([^)]*body\.sender/.test(src), false);
  assert.equal(/console\.\w+\([^)]*JSON\.stringify\(body/.test(src), false);
});
