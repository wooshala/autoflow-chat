// Phase 2C — pure room-move message + target validation.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildRoomMoveMessage, normalizeMoveTarget } from '../roomMoveMessage.ts';

const ROOMS = new Set(['201', '607', '608', '802']);

test('buildRoomMoveMessage: known language → guest sees its own language + room no', () => {
  const m = buildRoomMoveMessage('fr', '607');
  assert.equal(m.originalLang, 'ko');
  assert.match(m.translated.fr, /chambre 607/);
  assert.match(m.translated.ko, /607호/);
  assert.match(m.translated.en, /room 607/);
});

test('buildRoomMoveMessage: null language → en carries ko + en together (fallback)', () => {
  const m = buildRoomMoveMessage(null, '607');
  assert.match(m.translated.en, /607호/); // Korean line present
  assert.match(m.translated.en, /room 607/); // English line present
  assert.equal(m.translated.fr, undefined);
});

test('buildRoomMoveMessage: unsupported language falls back (no crash, no extra key)', () => {
  const m = buildRoomMoveMessage('de', '802');
  assert.match(m.translated.en, /802/);
  assert.equal(m.translated.de, undefined);
});

test('normalizeMoveTarget: valid target', () => {
  assert.deepEqual(normalizeMoveTarget('607', '608', ROOMS), { ok: true, roomNo: '607' });
  assert.deepEqual(normalizeMoveTarget('  607 ', '608', ROOMS), { ok: true, roomNo: '607' }); // trims
});

test('normalizeMoveTarget: empty / unknown / same-room rejected', () => {
  assert.deepEqual(normalizeMoveTarget('', '608', ROOMS), { ok: false, code: 'EMPTY' });
  assert.deepEqual(normalizeMoveTarget('   ', '608', ROOMS), { ok: false, code: 'EMPTY' });
  assert.deepEqual(normalizeMoveTarget('999', '608', ROOMS), { ok: false, code: 'UNKNOWN_ROOM' });
  assert.deepEqual(normalizeMoveTarget('608', '608', ROOMS), { ok: false, code: 'SAME_ROOM' });
});
