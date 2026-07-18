// Phase 1F.1 — left-navigation selection tests.
// Run: node --test lib/rooms/__tests__/chatLayout.spec.ts

import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveLeftNavigationMode } from '../chatLayout.ts';

const mode = (
  layoutMode: 'standard' | 'ops',
  roomNavigationEnabled: boolean,
  isMobileViewport: boolean,
) => resolveLeftNavigationMode({ layoutMode, roomNavigationEnabled, isMobileViewport });

test('standard + roomNav false + desktop → none (default: no left panel)', () => {
  assert.equal(mode('standard', false, false), 'none');
});

test('standard + roomNav true + desktop → room-navigation', () => {
  assert.equal(mode('standard', true, false), 'room-navigation');
});

test('standard + mobile → always none (even roomNav true)', () => {
  assert.equal(mode('standard', true, true), 'none');
  assert.equal(mode('standard', false, true), 'none');
});

test('ops + roomNav false → participant-sidebar', () => {
  assert.equal(mode('ops', false, false), 'participant-sidebar');
});

test('ops + roomNav true → room-navigation', () => {
  assert.equal(mode('ops', true, false), 'room-navigation');
});

test('ops layout ignores mobile flag (ops is desktop-gated upstream)', () => {
  assert.equal(mode('ops', true, true), 'room-navigation');
  assert.equal(mode('ops', false, true), 'participant-sidebar');
});
