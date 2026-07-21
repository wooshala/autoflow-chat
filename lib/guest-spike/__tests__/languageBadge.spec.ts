// Phase 1H.7 — the staff room language badge must NEVER show "언어 미선택" for a room with no
// active guest. resolveGuestLanguageBadge maps (session_status, language) → the 3 UI states,
// mirroring the staff API contract (session_status derived from getActiveSession; closed sessions
// are never reflected).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { resolveGuestLanguageBadge } from '../languages.ts';

test('CASE 1 — active session + language → show the language badge', () => {
  assert.deepEqual(resolveGuestLanguageBadge({ sessionStatus: 'open', language: 'en' }), { kind: 'language', lang: 'en' });
  assert.deepEqual(resolveGuestLanguageBadge({ sessionStatus: 'open', language: 'zh-CN' }), { kind: 'language', lang: 'zh-CN' });
});

test('CASE 2 — active session + no language → unselected (gray 언어 미선택)', () => {
  assert.deepEqual(resolveGuestLanguageBadge({ sessionStatus: 'open', language: null }), { kind: 'unselected' });
});

test('CASE 3/4 — no active session (none) → hidden (no badge)', () => {
  assert.deepEqual(resolveGuestLanguageBadge({ sessionStatus: 'none', language: null }), { kind: 'hidden' });
});

test('unknown status (null, e.g. pre-auth) → hidden (never "미선택")', () => {
  assert.deepEqual(resolveGuestLanguageBadge({ sessionStatus: null, language: null }), { kind: 'hidden' });
});

test('closed-session language is never exposed: session_status none + any language → hidden', () => {
  // The route derives session_status from getActiveSession (open only), so a closed session is
  // 'none'. Even if a stray language leaked into the input, 'none' must hide it — no active guest.
  assert.deepEqual(resolveGuestLanguageBadge({ sessionStatus: 'none', language: 'zh-CN' }), { kind: 'hidden' });
});

test('no-guest room and unselected room are DIFFERENT UI branches', () => {
  const noGuest = resolveGuestLanguageBadge({ sessionStatus: 'none', language: null });
  const unselected = resolveGuestLanguageBadge({ sessionStatus: 'open', language: null });
  assert.notEqual(noGuest.kind, unselected.kind); // 'hidden' !== 'unselected'
});
