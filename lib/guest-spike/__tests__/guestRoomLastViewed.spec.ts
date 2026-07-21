// Phase 1H.11 — lastViewed map helpers: tolerant parse + monotonic (forward-only) merge so a
// room never regresses to "unread" after being read.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseLastViewedMap, mergeLastViewed } from '../guestRoomLastViewed.ts';

const A = '2026-07-21T05:00:00.000Z';
const LATER = '2026-07-21T05:05:00.000Z';

test('parse: empty / corrupt / non-object → {}', () => {
  assert.deepEqual(parseLastViewedMap(null), {});
  assert.deepEqual(parseLastViewedMap(''), {});
  assert.deepEqual(parseLastViewedMap('{not json'), {});
  assert.deepEqual(parseLastViewedMap('[1,2]'), {});
  assert.deepEqual(parseLastViewedMap('"str"'), {});
});

test('parse: keeps valid ISO strings, drops invalid values', () => {
  const raw = JSON.stringify({ 'room-201': A, 'room-308': 'nope', 'room-x': 123 });
  assert.deepEqual(parseLastViewedMap(raw), { 'room-201': A });
});

test('merge: sets a new channel', () => {
  assert.deepEqual(mergeLastViewed({}, 'room-201', A), { 'room-201': A });
});

test('merge: advances to a newer timestamp', () => {
  assert.deepEqual(mergeLastViewed({ 'room-201': A }, 'room-201', LATER), { 'room-201': LATER });
});

test('merge: never regresses (equal or older) → same reference', () => {
  const m = { 'room-201': LATER };
  assert.equal(mergeLastViewed(m, 'room-201', LATER), m); // equal → no change
  assert.equal(mergeLastViewed(m, 'room-201', A), m); // older → no change
});

test('merge: ignores missing channel / null / invalid timestamp → same reference', () => {
  const m = { 'room-201': A };
  assert.equal(mergeLastViewed(m, 'room-201', null), m);
  assert.equal(mergeLastViewed(m, '', A), m);
  assert.equal(mergeLastViewed(m, 'room-201', 'garbage'), m);
});

test('merge: does not mutate the input map', () => {
  const m = { 'room-201': A };
  const next = mergeLastViewed(m, 'room-308', A);
  assert.deepEqual(m, { 'room-201': A }); // original untouched
  assert.deepEqual(next, { 'room-201': A, 'room-308': A });
});
