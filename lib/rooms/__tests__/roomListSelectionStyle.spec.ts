// Phase GC-Selection-Style — unit tests for row/title class priority.
// Run: node --import tsx --test lib/rooms/__tests__/roomListSelectionStyle.spec.ts

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { roomListRowSurfaceClass, roomListTitleClass, roomListTitleStyle } from '../roomListSelectionStyle.ts';

describe('roomListRowSurfaceClass', () => {
  it('selected wins over unanswered tint', () => {
    const c = roomListRowSurfaceClass({ active: true, unanswered: true });
    assert.match(c, /bg-white/);
    assert.match(c, /ring-blue-300/);
    assert.doesNotMatch(c, /FFF3F3/);
    assert.doesNotMatch(c, /dark:hover:bg-gray-900/);
  });

  it('unanswered tint when not selected', () => {
    const c = roomListRowSurfaceClass({ active: false, unanswered: true });
    assert.match(c, /FFF3F3/);
  });

  it('default hover only when idle', () => {
    const c = roomListRowSurfaceClass({ active: false, unanswered: false });
    assert.match(c, /hover:bg-white/);
  });
});

describe('roomListTitleClass', () => {
  it('selected title forces gray-800 with important', () => {
    const c = roomListTitleClass({ active: true, unanswered: true });
    assert.match(c, /!text-gray-800/);
    assert.doesNotMatch(c, /dark:text-gray-100/);
  });

  it('unanswered non-selected may use dark:text-gray-100', () => {
    const c = roomListTitleClass({ active: false, unanswered: true });
    assert.match(c, /font-semibold/);
    assert.match(c, /dark:text-gray-100/);
  });
});

describe('roomListTitleStyle', () => {
  it('selected sets inline gray-800 hex', () => {
    assert.deepEqual(roomListTitleStyle({ active: true }), { color: '#1f2937' });
  });

  it('non-selected has no inline color', () => {
    assert.equal(roomListTitleStyle({ active: false }), undefined);
  });
});
