// Phase 1H.11 — isGuestChannelUnread: a room is unread when a GUEST message is newer than what
// this browser last viewed and the room isn't currently open.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isGuestChannelUnread } from '../guestChannelUnread.ts';

const A = '2026-07-21T05:00:00.000Z';
const LATER = '2026-07-21T05:05:00.000Z';

test('no guest message → not unread', () => {
  assert.equal(isGuestChannelUnread({ latestGuestMessageAt: null, lastViewedAt: null, isSelected: false }), false);
});

test('currently selected room → never unread', () => {
  assert.equal(isGuestChannelUnread({ latestGuestMessageAt: LATER, lastViewedAt: A, isSelected: true }), false);
});

test('never viewed but a guest message exists → unread', () => {
  assert.equal(isGuestChannelUnread({ latestGuestMessageAt: A, lastViewedAt: null, isSelected: false }), true);
});

test('guest message newer than last viewed → unread', () => {
  assert.equal(isGuestChannelUnread({ latestGuestMessageAt: LATER, lastViewedAt: A, isSelected: false }), true);
});

test('guest message == last viewed → read', () => {
  assert.equal(isGuestChannelUnread({ latestGuestMessageAt: A, lastViewedAt: A, isSelected: false }), false);
});

test('guest message older than last viewed → read', () => {
  assert.equal(isGuestChannelUnread({ latestGuestMessageAt: A, lastViewedAt: LATER, isSelected: false }), false);
});

test('invalid timestamps are handled safely', () => {
  assert.equal(isGuestChannelUnread({ latestGuestMessageAt: 'garbage', lastViewedAt: A, isSelected: false }), false);
  // corrupt stored lastViewed → treat as never viewed
  assert.equal(isGuestChannelUnread({ latestGuestMessageAt: A, lastViewedAt: 'garbage', isSelected: false }), true);
});
