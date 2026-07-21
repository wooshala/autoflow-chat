// Phase 2A — pure Customer Context normalization: trims, caps lengths, validates the date.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeContextInput } from '../customerContextValidate.ts';

test('trims strings and coerces non-strings to empty', () => {
  const out = normalizeContextInput({ guestName: '  홍길동  ', guestPhone: 123, vehicleNo: null, memo: undefined });
  assert.equal(out.guestName, '홍길동');
  assert.equal(out.guestPhone, '');
  assert.equal(out.vehicleNo, '');
  assert.equal(out.memo, '');
  assert.equal(out.checkOutDate, null);
});

test('empty/whitespace checkout date → null', () => {
  assert.equal(normalizeContextInput({ checkOutDate: '' }).checkOutDate, null);
  assert.equal(normalizeContextInput({ checkOutDate: '   ' }).checkOutDate, null);
  assert.equal(normalizeContextInput({}).checkOutDate, null);
});

test('valid YYYY-MM-DD checkout date is kept', () => {
  assert.equal(normalizeContextInput({ checkOutDate: '2026-07-22' }).checkOutDate, '2026-07-22');
});

test('malformed checkout date throws INVALID_DATE', () => {
  assert.throws(() => normalizeContextInput({ checkOutDate: '2026/07/22' }), /INVALID_DATE/);
  assert.throws(() => normalizeContextInput({ checkOutDate: '22-07-2026' }), /INVALID_DATE/);
  assert.throws(() => normalizeContextInput({ checkOutDate: '2026-13-40' }), /INVALID_DATE/);
});

test('caps overly long fields', () => {
  const longName = 'x'.repeat(500);
  const out = normalizeContextInput({ guestName: longName, memo: 'y'.repeat(5000) });
  assert.equal(out.guestName.length, 100);
  assert.equal(out.memo.length, 2000);
});
