// Phase GC-Notification-Completion — unit tests for toast/title helpers.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  guestChatDocumentTitle,
  guestToastBody,
  guestToastTitle,
  totalUnansweredMessages,
} from '../guestDesktopNotify.ts';

describe('guestToastTitle', () => {
  it('formats room number with 호', () => {
    assert.equal(guestToastTitle('201'), '201호');
  });
  it('keeps existing 호 suffix', () => {
    assert.equal(guestToastTitle('201호'), '201호');
  });
  it('falls back when empty', () => {
    assert.equal(guestToastTitle(null), 'Guest Chat');
  });
});

describe('guestToastBody', () => {
  it('prefixes 손님 line', () => {
    assert.equal(guestToastBody('우산 있나요?'), '손님:\n우산 있나요?');
  });
  it('default preview when empty', () => {
    assert.match(guestToastBody(''), /손님:/);
  });
});

describe('totalUnansweredMessages', () => {
  it('sums positive counts only', () => {
    assert.equal(
      totalUnansweredMessages({
        a: { guestMessageCount: 2 },
        b: { guestMessageCount: 1 },
        c: { guestMessageCount: 0 },
      }),
      3,
    );
  });
});

describe('guestChatDocumentTitle', () => {
  it('suffix form when count > 0', () => {
    assert.equal(guestChatDocumentTitle(3), 'AutoFlow 채팅 (3)');
  });
  it('base when zero', () => {
    assert.equal(guestChatDocumentTitle(0), 'AutoFlow 채팅');
  });
});
