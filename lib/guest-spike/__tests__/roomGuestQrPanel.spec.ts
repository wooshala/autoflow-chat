// Room guest QR panel wiring. Run: node --test lib/guest-spike/__tests__/roomGuestQrPanel.spec.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const panel = readFileSync(join(root, 'components/chat/customer-info/CustomerInformationPanel.tsx'), 'utf8');
const card = readFileSync(join(root, 'components/chat/customer-info/RoomGuestQrCard.tsx'), 'utf8');
const printScript = readFileSync(join(root, 'scripts/generate-room-qr.ts'), 'utf8');

test('CustomerInformationPanel mounts RoomGuestQrCard for the selected room', () => {
  assert.match(panel, /import \{ RoomGuestQrCard \}/);
  assert.match(panel, /<RoomGuestQrCard\s+channelKey=\{channelKey\}/);
  // Header title then QR card in the main return (selected-room chrome).
  const headerIdx = panel.indexOf('고객 정보');
  const qrIdx = panel.indexOf('<RoomGuestQrCard');
  assert.ok(headerIdx >= 0 && qrIdx > headerIdx, 'QR card should follow the 고객 정보 header');
});

test('RoomGuestQrCard uses shared guest URL SoT + local qrcode (no external QR HTTP)', () => {
  assert.match(card, /guestChannelUrl/);
  assert.match(card, /from 'qrcode'/);
  assert.match(card, /QRCode\.toDataURL/);
  assert.match(card, /navigator\.clipboard\.writeText/);
  assert.match(card, /링크가 복사되었습니다/);
  assert.match(card, /객실 QR 코드/);
  assert.doesNotMatch(card, /api\.qrserver\.com/);
  assert.doesNotMatch(card, /guestQrImageUrl/);
});

test('print pipeline imports shared guestRoomUrl SoT (no duplicate default base)', () => {
  assert.match(printScript, /from '\.\.\/lib\/guest-spike\/guestRoomUrl'/);
  assert.match(printScript, /resolveGuestQrBaseUrl/);
  assert.match(printScript, /guestRoomUrl/);
  assert.doesNotMatch(printScript, /const BASE_URL = \(argValue\('base-url'\) \|\| process\.env\.QR_BASE_URL/);
});
