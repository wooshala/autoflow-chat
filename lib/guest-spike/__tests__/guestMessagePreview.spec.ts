import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  GUEST_MESSAGE_PREVIEW_EMPTY,
  GUEST_MESSAGE_PREVIEW_MAX,
  buildGuestMessagePreview,
  maskGuestPreviewPii,
} from '../guestMessagePreview.ts';

test('prefers KO over original', () => {
  assert.equal(
    buildGuestMessagePreview({
      original_text: 'hello',
      translated_json: { ko: '수건 두 장 부탁드립니다.' },
    }),
    '수건 두 장 부탁드립니다.',
  );
});

test('falls back to original then empty label', () => {
  assert.equal(
    buildGuestMessagePreview({ original_text: 'こんにちは', translated_json: {} }),
    'こんにちは',
  );
  assert.equal(buildGuestMessagePreview({ original_text: '   ', translated_json: { ko: '' } }), GUEST_MESSAGE_PREVIEW_EMPTY);
  assert.equal(buildGuestMessagePreview({}), GUEST_MESSAGE_PREVIEW_EMPTY);
});

test('normalizes whitespace and strips controls before mask/truncate', () => {
  const raw = ['수건', '두', '장', '부탁드립니다.'].join('\n\t');
  assert.equal(
    buildGuestMessagePreview({
      original_text: `\u0000${raw}\u0007`,
    }),
    '수건 두 장 부탁드립니다.',
  );
});

test('masks phone / card / rrn / email before truncation', () => {
  assert.match(maskGuestPreviewPii('연락처 010-1234-5678 입니다'), /010-\*\*\*\*-5678/);
  assert.match(maskGuestPreviewPii('카드 1234-5678-9012-3456'), /\*\*\*\*-\*\*\*\*-\*\*\*\*-3456/);
  assert.match(maskGuestPreviewPii('주민 900101-1234567'), /\*\*\*\*\*\*-\*\*\*\*\*\*\*/);
  assert.match(maskGuestPreviewPii('메일 ab@example.com'), /a\*\*\*@example\.com/);
});

test('truncates to 80 after masking', () => {
  const long = '가'.repeat(100);
  const out = buildGuestMessagePreview({ original_text: long });
  assert.equal(out.length, GUEST_MESSAGE_PREVIEW_MAX + 1); // 80 + ellipsis
  assert.ok(out.endsWith('…'));
});

test('mask-then-truncate keeps phone pattern detectable across cut boundary', () => {
  const prefix = '요청드립니다. 연락은 ';
  const phone = '010-1234-5678';
  const suffix = '로 부탁';
  const raw = prefix + phone + suffix + '합니다. '.repeat(20);
  const out = buildGuestMessagePreview({ original_text: raw });
  assert.doesNotMatch(out, /010-1234-5678/);
  assert.match(out, /010-\*\*\*\*-5678|010-\*\*\*\*/);
});
