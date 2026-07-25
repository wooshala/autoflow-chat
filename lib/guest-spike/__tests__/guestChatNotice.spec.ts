// Guest Chat A4 notice SoT + HTML. Run: npx tsx --test lib/guest-spike/__tests__/guestChatNotice.spec.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  GUEST_CHAT_EMERGENCY_PHONE,
  GUEST_CHAT_HOTEL_NAME,
  GUEST_CHAT_NOTICE_QR_MM,
} from '../guestChatNoticeConfig.ts';
import {
  guestChatNoticeCopy,
  guestChatNoticeLanguageLine,
  noticeCopyFor,
} from '../guestChatNoticeCopy.ts';
import { buildGuestChatNoticeHtml } from '../guestChatNoticePrintHtml.ts';
import { SUPPORTED_LANGS } from '../languages.ts';
import { guestRoomUrl } from '../guestRoomUrl.ts';

test('emergency phone is canonical and not a placeholder', () => {
  assert.equal(GUEST_CHAT_EMERGENCY_PHONE, '010-4657-6680');
  assert.doesNotMatch(GUEST_CHAT_EMERGENCY_PHONE, /1234-5678/);
});

test('hotel name is single-property constant (tenant-ready override path)', () => {
  assert.equal(GUEST_CHAT_HOTEL_NAME, '호텔 레이블');
  assert.doesNotMatch(GUEST_CHAT_HOTEL_NAME, /AutoFlow Hotel/);
});

test('notice QR print size is 40mm', () => {
  assert.equal(GUEST_CHAT_NOTICE_QR_MM, 40);
});

test('notice copy exists for every supported guest language', () => {
  for (const lang of SUPPORTED_LANGS) {
    const c = noticeCopyFor(lang);
    assert.ok(c.scanLead.length > 0, lang);
    assert.ok(c.wifiNightstand.length > 0, lang);
    assert.match(c.wifiNightstand, /Wi-?Fi|Wi‑Fi|WIFI|wifi|와이파이/i);
    // Must not embed concrete Wi-Fi credentials
    assert.doesNotMatch(c.wifiNightstand, /\bSSID\s*[:=]/);
    assert.doesNotMatch(c.wifiNightstand, /Password\s*[:=]/i);
    assert.doesNotMatch(c.wifiNightstand, /비밀번호\s*[:=]/);
    // Soft after-checkout CTA — no “always available after checkout” guarantee
    assert.doesNotMatch(c.afterCheckout, /항상|always available|체크아웃 후에도 항상/i);
    assert.match(c.privacyBody, /서비스|services|サービス|服务|услуг|services de|servicios/i);
    assert.doesNotMatch(c.privacyBody, /수집하지 않습니다|완전히 안전|do not collect|completely safe/i);
  }
});

test('Korean Wi-Fi copy mentions phone nightstand sticker', () => {
  assert.match(guestChatNoticeCopy.ko.wifiNightstand, /전화기가 놓여 있는 협탁/);
  assert.match(guestChatNoticeCopy.ko.wifiNightstand, /Wi-Fi QR 스티커/);
});

test('language line uses SoT display names', () => {
  const line = guestChatNoticeLanguageLine();
  assert.match(line, /한국어/);
  assert.match(line, /English/);
  assert.match(line, /日本語/);
  assert.match(line, /中文/);
});

test('A4 HTML includes room, URL, 40mm QR, wifi, emergency — no chat UI chrome', () => {
  for (const room of ['201', '607']) {
    const url = guestRoomUrl(room);
    const html = buildGuestChatNoticeHtml({
      roomNo: room,
      guestUrl: url,
      qrSvg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>',
      hotelName: GUEST_CHAT_HOTEL_NAME,
    });
    assert.match(html, /@page \{\s*size:\s*A4 portrait/);
    assert.match(html, new RegExp(`${room}호`));
    assert.match(html, /호텔 레이블/);
    assert.match(html, new RegExp(`room-${room}`));
    assert.match(html, /010-4657-6680/);
    assert.match(html, /전화기가 놓여 있는 협탁/);
    assert.match(html, /width:\s*40mm/);
    assert.match(html, /height:\s*40mm/);
    assert.match(html, /@media print/);
    assert.doesNotMatch(html, /010-1234-5678/);
    assert.doesNotMatch(html, /Password\s*:/i);
    assert.doesNotMatch(html, /링크 복사|QR 출력|고객 정보 입력|미리보기/);
    assert.match(html, /toolbar/);
    assert.match(html, /@media print[\s\S]*\.toolbar[\s\S]*display:\s*none/);
  }
});

test('RoomGuestQrCard uses same-document print (no window.open / popup prompt)', () => {
  const card = readFileSync(join(process.cwd(), 'components/chat/customer-info/RoomGuestQrCard.tsx'), 'utf8');
  const qrHelper = readFileSync(join(process.cwd(), 'lib/guest-spike/buildGuestChatNoticeQrSvg.ts'), 'utf8');
  const sheet = readFileSync(join(process.cwd(), 'components/chat/customer-info/GuestChatNoticeSheet.tsx'), 'utf8');
  const css = readFileSync(join(process.cwd(), 'components/chat/customer-info/guestChatNoticePrint.css'), 'utf8');
  assert.match(card, /QR 출력/);
  assert.match(card, /링크 복사/);
  assert.match(card, /buildGuestChatNoticeQrSvg/);
  assert.match(card, /window\.print\(/);
  assert.match(card, /afterprint/);
  assert.match(card, /printing-guest-notice/);
  assert.match(card, /guest-notice-print-root/);
  assert.match(card, /GuestChatNoticeSheet/);
  assert.match(card, /출력 준비 중/);
  assert.match(card, /printBusyRef/);
  assert.doesNotMatch(card, /window\.open\s*\(/);
  assert.doesNotMatch(card, /팝업 허용/);
  assert.doesNotMatch(qrHelper, /window\.open\s*\(/);
  assert.doesNotMatch(qrHelper, /openGuestChatNoticePrint/);
  assert.match(sheet, /GUEST_CHAT_EMERGENCY_PHONE/);
  assert.match(sheet, /guestChatNoticeCopy/);
  assert.match(css, /body\.printing-guest-notice/);
  assert.match(css, /\.guest-notice-print-root/);
  assert.match(sheet, /GUEST_CHAT_NOTICE_QR_MM/);
});

test('batch PDF pipeline uses notice SoT + emergency constant', () => {
  const src = readFileSync(join(process.cwd(), 'scripts/generate-room-qr.ts'), 'utf8');
  assert.match(src, /guestChatNoticeCopy/);
  assert.match(src, /GUEST_CHAT_EMERGENCY_PHONE/);
  assert.match(src, /GUEST_CHAT_NOTICE_QR_MM/);
  assert.match(src, /wifiNightstand/);
  assert.doesNotMatch(src, /010-1234-5678/);
  assert.equal(guestChatNoticeCopy.ko.emergencyLabel.length > 0, true);
});
