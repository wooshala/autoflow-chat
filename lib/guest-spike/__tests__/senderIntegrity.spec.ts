// Phase 2A' — the guest messages route must derive `sender` from the authenticated context,
// never from the request body. A cookie-holding guest posting {"sender":"staff"} previously
// stored a staff message, which silently cleared that room's unanswered state.
//
// IMAGE-CHAT-01A-SIMPLIFY — sender is assigned in resolvePostContext(), shared by JSON and
// multipart POST paths. This pins the contract at the source level instead of booting the route.

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

function sliceFn(name: string, until: string): string {
  const start = src.indexOf(name);
  assert.ok(start > -1, `expected ${name} in messages route`);
  const end = src.indexOf(until, start + name.length);
  return stripComments(src.slice(start, end > start ? end : src.length));
}

const resolvePostContext = sliceFn('async function resolvePostContext', 'async function translateMessage');
const postPaths = [
  resolvePostContext,
  sliceFn('async function postJsonMessage', 'async function postMultipartMessage'),
  sliceFn('async function postMultipartMessage', 'export async function POST'),
  stripComments(src.slice(src.indexOf('export async function POST'))),
].join('\n');

test('sender is never read from the request body', () => {
  assert.equal(/sender\s*=\s*body\.sender/.test(postPaths), false);
  assert.equal(/body\.sender\s*===\s*['"]staff['"]/.test(postPaths), false);
  assert.equal(/body\.sender/.test(postPaths), false);
});

test('sender is derived from the ?as=staff authenticated branch', () => {
  assert.match(
    resolvePostContext,
    /sender\s*=\s*req\.nextUrl\.searchParams\.get\('as'\)\s*===\s*'staff'/,
  );
  assert.match(resolvePostContext, /if \(sender === 'staff'\)/);
  assert.match(resolvePostContext, /await requireStaff\(req\)/);
});

test('sender is assigned only after resolveSession succeeded', () => {
  const resolveAt = resolvePostContext.indexOf('await resolveSession');
  const assignAt = resolvePostContext.search(/sender\s*=\s*req\.nextUrl\.searchParams/);
  assert.ok(resolveAt > -1 && assignAt > resolveAt, 'sender must be set after the auth gate');
});

test('the body sender field is still tolerated (no breaking change)', () => {
  assert.match(src, /sender\?:\s*unknown/);
});

test('raw body / sender is not logged', () => {
  assert.equal(/console\.\w+\([^)]*body\.sender/.test(src), false);
  assert.equal(/console\.\w+\([^)]*JSON\.stringify\(body/.test(src), false);
});
