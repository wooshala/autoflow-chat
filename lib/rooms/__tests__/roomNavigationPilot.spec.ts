// Phase 1E.2 — pilot shortcut decision tests.
// Run: node --test lib/rooms/__tests__/roomNavigationPilot.spec.ts

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isPilotShortcut,
  isEditableTarget,
  shouldHandlePilotToggle,
  nextPilotOverride,
  type PilotKeyEvent,
} from '../roomNavigationPilot.ts';

const ev = (over: Partial<PilotKeyEvent> = {}): PilotKeyEvent => ({
  ctrlKey: true,
  altKey: true,
  shiftKey: true,
  metaKey: false,
  key: 'n',
  repeat: false,
  isComposing: false,
  ...over,
});

test('exact Ctrl+Alt+Shift+N → true (case-insensitive key)', () => {
  assert.equal(isPilotShortcut(ev()), true);
  assert.equal(isPilotShortcut(ev({ key: 'N' })), true);
});

test('missing a modifier → false', () => {
  assert.equal(isPilotShortcut(ev({ altKey: false })), false, 'Ctrl+Shift+N');
  assert.equal(isPilotShortcut(ev({ shiftKey: false })), false);
  assert.equal(isPilotShortcut(ev({ ctrlKey: false })), false);
});

test('wrong key → false', () => {
  assert.equal(isPilotShortcut(ev({ key: 'm' })), false);
  assert.equal(isPilotShortcut(ev({ key: 'Enter' })), false);
});

test('Meta combo → false', () => {
  assert.equal(isPilotShortcut(ev({ metaKey: true })), false);
});

test('auto-repeat → false', () => {
  assert.equal(isPilotShortcut(ev({ repeat: true })), false);
});

test('isEditableTarget: input/textarea/select/contenteditable', () => {
  assert.equal(isEditableTarget({ tagName: 'INPUT' }), true);
  assert.equal(isEditableTarget({ tagName: 'textarea' }), true);
  assert.equal(isEditableTarget({ tagName: 'SELECT' }), true);
  assert.equal(isEditableTarget({ isContentEditable: true }), true);
  assert.equal(isEditableTarget({ tagName: 'DIV' }), false);
  assert.equal(isEditableTarget(null), false);
});

test('shouldHandlePilotToggle: blocked while editing or composing', () => {
  assert.equal(shouldHandlePilotToggle(ev(), { tagName: 'INPUT' }), false, 'input target');
  assert.equal(shouldHandlePilotToggle(ev(), { tagName: 'TEXTAREA' }), false, 'textarea target');
  assert.equal(shouldHandlePilotToggle(ev(), { isContentEditable: true }), false, 'contenteditable');
  assert.equal(shouldHandlePilotToggle(ev({ isComposing: true }), { tagName: 'DIV' }), false, 'IME composing');
  assert.equal(shouldHandlePilotToggle(ev(), { tagName: 'DIV' }), true, 'non-editable + exact combo');
  assert.equal(shouldHandlePilotToggle(ev(), null), true, 'no target');
});

test('nextPilotOverride: on → off; off/null/invalid → on', () => {
  assert.equal(nextPilotOverride('on'), 'off');
  assert.equal(nextPilotOverride('off'), 'on');
  assert.equal(nextPilotOverride(null), 'on');
});
