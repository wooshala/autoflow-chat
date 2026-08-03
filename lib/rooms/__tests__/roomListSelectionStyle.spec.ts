// Phase GC-RoomList-Contrast — unit tests for row/title class priority.
// Run: node --import tsx --test lib/rooms/__tests__/roomListSelectionStyle.spec.ts

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { roomListRowSurfaceClass, roomListTitleClass, roomListTitleStyle } from '../roomListSelectionStyle.ts';

function assertNoDarkVariants(c: string) {
  assert.doesNotMatch(c, /\bdark:/);
}

describe('roomListRowSurfaceClass', () => {
  it('selected wins over unanswered tint', () => {
    const c = roomListRowSurfaceClass({ active: true, unanswered: true });
    assert.match(c, /bg-white/);
    assert.match(c, /ring-blue-300/);
    assert.doesNotMatch(c, /FFF3F3/);
    assertNoDarkVariants(c);
  });

  it('unanswered tint when not selected (light sidebar only)', () => {
    const c = roomListRowSurfaceClass({ active: false, unanswered: true });
    assert.match(c, /FFF3F3/);
    assertNoDarkVariants(c);
  });

  it('default hover only when idle', () => {
    const c = roomListRowSurfaceClass({ active: false, unanswered: false });
    assert.match(c, /hover:bg-white/);
    assertNoDarkVariants(c);
  });
});

describe('roomListTitleClass', () => {
  it('never uses dark:text-* (light sidebar)', () => {
    for (const opts of [
      { active: true, unanswered: false },
      { active: true, unanswered: true },
      { active: false, unanswered: true },
      { active: false, unanswered: false },
    ]) {
      assertNoDarkVariants(roomListTitleClass(opts));
    }
  });

  it('selected title forces gray-800', () => {
    const c = roomListTitleClass({ active: true, unanswered: true });
    assert.match(c, /!text-gray-800/);
  });

  it('unanswered non-selected is gray-900 semibold', () => {
    const c = roomListTitleClass({ active: false, unanswered: true });
    assert.match(c, /font-semibold/);
    assert.match(c, /text-gray-900/);
  });

  it('default is gray-800 with hover gray-900', () => {
    const c = roomListTitleClass({ active: false, unanswered: false });
    assert.match(c, /text-gray-800/);
    assert.match(c, /group-hover:text-gray-900/);
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
