// Guest Chat A4 notice SoT + HTML. Run: npx tsx --test lib/guest-spike/__tests__/guestChatNotice.spec.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import {
  GUEST_CHAT_EMERGENCY_PHONE,
  GUEST_CHAT_HOTEL_NAME,
  GUEST_CHAT_NOTICE_QR_MM,
  GUEST_CHAT_NOTICE_WIFI_QR_MM,
} from '../guestChatNoticeConfig.ts';
import {
  guestChatNoticeCopy,
  guestChatNoticeLanguageLine,
  noticeCopyFor,
} from '../guestChatNoticeCopy.ts';
import { buildGuestChatNoticeHtml } from '../guestChatNoticePrintHtml.ts';
import {
  buildWifiJoinPayload,
  escapeWifiQrField,
} from '../buildGuestChatNoticeQrSvg.ts';
import { ROOM_WIFI_BY_ROOM, roomWifiFor } from '../roomWifiCredentials.generated.ts';
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

test('notice QR print size is 40mm (Guest Chat) and Wi-Fi is secondary 24mm', () => {
  assert.equal(GUEST_CHAT_NOTICE_QR_MM, 40);
  assert.equal(GUEST_CHAT_NOTICE_WIFI_QR_MM, 24);
  assert.ok(GUEST_CHAT_NOTICE_QR_MM > GUEST_CHAT_NOTICE_WIFI_QR_MM);
});

test('WIFI join payload escapes special characters', () => {
  assert.equal(escapeWifiQrField('a;b,c:"d\\e'), 'a\\;b\\,c\\:\\"d\\\\e');
  assert.match(buildWifiJoinPayload('Net_5G', 'pass;word'), /^WIFI:T:WPA;S:Net_5G;P:pass\\;word;H:false;;$/);
});

test('notice copy exists for every supported guest language', () => {
  for (const lang of SUPPORTED_LANGS) {
    const c = noticeCopyFor(lang);
    assert.ok(c.demoGuest.length > 0, lang);
    assert.ok(c.demoStaff.length > 0, lang);
    assert.ok(c.demoCaption.length > 0, lang);
    assert.ok(c.scanBar.length > 0, lang);
    assert.ok(c.step1Body.length > 0, lang);
    assert.ok(c.step2Body.length > 0, lang);
    assert.ok(c.step3Body.length > 0, lang);
    assert.match(c.helpIntro, /QR|qr|二维码|スキャン|скан|Scan|Escane/i);
    assert.ok(c.valueLine.length > 0, lang);
    assert.ok(c.servicesTitle.length > 0, lang);
    assert.ok(c.translateBadge.length > 0, lang);
    assert.ok(c.staffWatchBody.length > 0, lang);
    assert.ok(c.frontDeskLabel.length > 0, lang);
    assert.ok(c.wifiNightstand.length > 0, lang);
    assert.match(c.wifiNightstand, /Wi-?Fi|Wi‑Fi|WIFI|wifi|와이파이/i);
    // Copy SoT must not embed concrete Wi-Fi credential values
    assert.doesNotMatch(c.wifiNightstand, /\bSSID\s*[:=]/);
    assert.doesNotMatch(c.wifiNightstand, /Password\s*[:=]/i);
    assert.doesNotMatch(c.wifiNightstand, /비밀번호\s*[:=]/);
    assert.ok(c.wifiPanelTitle.length > 0, lang);
    assert.ok(c.wifiPasswordLabel.length > 0, lang);
    // Soft after-checkout CTA — no “always available after checkout” guarantee
    assert.doesNotMatch(c.afterCheckout, /항상|always available|체크아웃 후에도 항상/i);
    assert.doesNotMatch(c.privacyBody, /자동 종료|automatically (end|close)|퇴실 후.*종료/i);
    assert.match(c.privacyBody, /서비스|services|サービス|服务|услуг|services de|servicios/i);
    assert.doesNotMatch(c.privacyBody, /수집하지 않습니다|완전히 안전|do not collect|completely safe/i);
    for (const id of Object.keys(c.serviceLabels)) {
      assert.ok(c.serviceLabels[id as keyof typeof c.serviceLabels].length > 0, `${lang}:${id}`);
    }
  }
});

test('Korean Wi-Fi copy emphasizes auto-connect (credentials live in roomWifi SoT)', () => {
  assert.match(guestChatNoticeCopy.ko.wifiPanelTitle, /Wi-Fi/);
  assert.match(guestChatNoticeCopy.ko.wifiScanHint, /자동/);
  assert.match(guestChatNoticeCopy.ko.wifiPasswordLabel, /비밀번호/);
  assert.match(guestChatNoticeCopy.ko.wifi5gLabel, /5GHz/);
  assert.match(guestChatNoticeCopy.ko.wifi24Label, /2\.4GHz/);
  assert.match(guestChatNoticeCopy.ko.howToTitle, /QR/);
  assert.match(guestChatNoticeCopy.ko.helpIntro, /Guest Chat QR/);
  assert.match(guestChatNoticeCopy.ko.hoursBody, /24시간/);
  assert.match(guestChatNoticeCopy.ko.replyBody, /전화 없이/);
  assert.match(guestChatNoticeCopy.ko.scanBar, /스캔/);
  assert.match(guestChatNoticeCopy.ko.step1Body, /QR/);
  assert.doesNotMatch(guestChatNoticeCopy.ko.wifiNightstand, /A52D33A1/);
});

test('room Wi-Fi credentials cover all roster rooms with dual QR paths', () => {
  assert.equal(Object.keys(ROOM_WIFI_BY_ROOM).length, 39);
  const w201 = roomWifiFor('201');
  assert.ok(w201);
  assert.match(w201!.ssid24, /U\+Net/);
  assert.match(w201!.ssid5g, /_5G$/);
  assert.ok(w201!.password.length >= 6);
  assert.match(w201!.qr24Path, /\/wifi-qr\/201\/24g\.jpg/);
  assert.match(w201!.qr5gPath, /\/wifi-qr\/201\/5g\.jpg/);
  assert.ok(existsSync(join(process.cwd(), 'public', 'wifi-qr', '201', '24g.jpg')));
  assert.ok(existsSync(join(process.cwd(), 'public', 'wifi-qr', '201', '5g.jpg')));
});

test('language line uses SoT display names', () => {
  const line = guestChatNoticeLanguageLine();
  assert.match(line, /한국어/);
  assert.match(line, /English/);
  assert.match(line, /日本語/);
  assert.match(line, /中文/);
});

test('A4 HTML is chat → services → trust → Wi-Fi bottom (one page hierarchy)', () => {
  const wifiSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><rect width="8" height="8"/></svg>';
  for (const room of ['201', '607']) {
    const url = guestRoomUrl(room);
    const html = buildGuestChatNoticeHtml({
      roomNo: room,
      guestUrl: url,
      qrSvg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>',
      wifiQrSvg5g: wifiSvg,
      wifiQrSvg24: wifiSvg,
      hotelName: GUEST_CHAT_HOTEL_NAME,
    });
    assert.match(html, /@page \{\s*size:\s*A4 portrait/);
    assert.match(html, /data-layout="chat-services-wifi"/);
    assert.match(html, new RegExp(`${room}호`));
    assert.match(html, /호텔 레이블/);
    assert.match(html, new RegExp(`room-${room}`));
    assert.match(html, /010-4657-6680/);
    assert.match(html, /gn-concierge/);
    assert.match(html, /gn-guide/);
    assert.match(html, /gn-guide-steps/);
    assert.match(html, /gn-step-num/);
    assert.match(html, /gn-scan-bar/);
    assert.doesNotMatch(html, /class="gn-chat-hero"/);
    assert.doesNotMatch(html, /class="gn-phone"/);
    assert.match(html, /생수 부탁드립니다/);
    assert.match(html, /곧 가져다드리겠습니다/);
    assert.match(html, /스마트폰으로 QR/);
    assert.match(html, /gn-services/);
    assert.doesNotMatch(html, /gn-howto-title/);
    assert.doesNotMatch(html, /객실 QR 사용 방법/);
    assert.doesNotMatch(html, /gn-lang-strip/);
    assert.match(html, /gn-trust/);
    assert.match(html, /24시간 이용/);
    assert.match(html, /전화 없이 요청/);
    assert.match(html, /gn-wifi-aux/);
    assert.match(html, /gn-wifi-band-card/);
    assert.match(html, /gn-wifi-aux-mid/);
    assert.match(html, /gn-wifi-icon/);
    assert.doesNotMatch(html, /gn-wifi-panel/);
    const bodyHtml = html.slice(html.indexOf('<body'));
    const chatIdx = bodyHtml.indexOf('class="gn-guide"');
    const servicesIdx = bodyHtml.indexOf('class="gn-services"');
    const trustIdx = bodyHtml.indexOf('class="gn-trust"');
    const wifiIdx = bodyHtml.indexOf('class="gn-wifi-aux"');
    const emergencyIdx = bodyHtml.indexOf('gn-emergency-phone');
    assert.ok(chatIdx > 0 && servicesIdx > chatIdx, 'services after chat');
    assert.ok(trustIdx > servicesIdx, 'trust after services');
    assert.ok(wifiIdx > trustIdx, 'Wi-Fi after trust');
    assert.ok(emergencyIdx > wifiIdx, 'emergency after Wi-Fi');
    const midIdx = bodyHtml.indexOf('class="gn-wifi-aux-mid"');
    const firstBand = bodyHtml.indexOf('class="gn-wifi-band-card"');
    const secondBand = bodyHtml.indexOf('class="gn-wifi-band-card"', firstBand + 1);
    assert.ok(firstBand > 0 && midIdx > firstBand && secondBand > midIdx, 'Wi-Fi title must sit between band cards');
    assert.doesNotMatch(html, /class="gn-url"/);
    assert.doesNotMatch(html, /\/wifi-qr\//);
    assert.match(html, /gn-wifi-cred-pw/);
    assert.match(html, /gn-service-grid/);
    assert.match(html, /gn-service-label-en/);
    assert.match(html, /Extra towels/);
    assert.match(html, /추가 수건/);
    assert.match(html, /gn-service-icon[\s\S]*<svg/);
    assert.match(html, /자동 번역/);
    assert.match(html, /자동으로 연결/);
    assert.match(html, /Front Desk/);
    assert.match(html, /width:\s*40mm/);
    assert.match(html, /height:\s*40mm/);
    assert.match(html, /width:\s*24mm/);
    assert.match(html, /height:\s*24mm/);
    assert.match(html, new RegExp(`data-guest-url="[^"]*room-${room}`));
    assert.doesNotMatch(html, new RegExp(`<p[^>]*>https://[^<]*room-${room}`));
    assert.match(html, /@media print/);
    assert.doesNotMatch(html, /010-1234-5678/);
    assert.doesNotMatch(html, /링크 복사|QR 출력|고객 정보 입력|미리보기/);
    assert.match(html, /toolbar/);
    assert.match(html, /@media print[\s\S]*\.toolbar[\s\S]*display:\s*none/);
  }
});

test('A4 HTML Wi-Fi placeholder when SVGs omitted (never empty jpg box)', () => {
  const html = buildGuestChatNoticeHtml({
    roomNo: '201',
    guestUrl: guestRoomUrl('201'),
    qrSvg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>',
  });
  assert.match(html, /gn-wifi-ph/);
  assert.doesNotMatch(html, /\/wifi-qr\/201\//);
});

test('RoomGuestQrCard uses same-document print + inline Wi-Fi SVG (no window.open)', () => {
  const card = readFileSync(join(process.cwd(), 'components/chat/customer-info/RoomGuestQrCard.tsx'), 'utf8');
  const qrHelper = readFileSync(join(process.cwd(), 'lib/guest-spike/buildGuestChatNoticeQrSvg.ts'), 'utf8');
  const sheet = readFileSync(join(process.cwd(), 'components/chat/customer-info/GuestChatNoticeSheet.tsx'), 'utf8');
  const css = readFileSync(join(process.cwd(), 'components/chat/customer-info/guestChatNoticePrint.css'), 'utf8');
  assert.match(card, /QR 출력/);
  assert.match(card, /링크 복사/);
  assert.match(card, /buildGuestChatNoticeQrSvg/);
  assert.match(card, /buildWifiNoticeQrSvg/);
  assert.match(card, /Promise\.all/);
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
  assert.match(qrHelper, /buildWifiNoticeQrSvg/);
  assert.match(qrHelper, /buildWifiJoinPayload/);
  assert.match(sheet, /GUEST_CHAT_EMERGENCY_PHONE/);
  assert.match(sheet, /guestChatNoticeCopy/);
  assert.match(sheet, /GUEST_NOTICE_SERVICE_IDS/);
  assert.match(sheet, /roomWifiFor/);
  assert.match(sheet, /gn-concierge/);
  assert.match(sheet, /gn-guide/);
  assert.match(sheet, /gn-guide-steps/);
  assert.match(sheet, /gn-wifi-aux/);
  assert.match(sheet, /gn-wifi-band-card/);
  assert.match(sheet, /gn-wifi-aux-mid/);
  assert.match(sheet, /GUEST_NOTICE_WIFI_ICON/);
  assert.match(sheet, /wifiQrSvg5g/);
  assert.doesNotMatch(sheet, /gn-wifi-panel/);
  assert.doesNotMatch(sheet, /className="gn-url"/);
  assert.doesNotMatch(sheet, /qr5gPath|qr24Path/);
  assert.match(css, /body\.printing-guest-notice/);
  assert.match(css, /\.guest-notice-print-root/);
  assert.match(css, /\.gn-concierge/);
  assert.match(css, /\.gn-guide/);
  assert.match(css, /\.gn-wifi-aux/);
  assert.match(css, /\.gn-wifi-aux-mid/);
  assert.match(css, /\.gn-wifi-band-card/);
  assert.match(sheet, /GUEST_NOTICE_STEP_SCAN_ART/);
  assert.match(sheet, /GUEST_NOTICE_STEP_STAFF_ART/);
  assert.match(sheet, /gn-scan-bar/);
  assert.match(css, /\.gn-step-num/);
  assert.match(css, /\.gn-scan-bar/);
  assert.doesNotMatch(sheet, /gn-howto-title/);
  assert.doesNotMatch(sheet, /gn-lang-strip/);
  assert.doesNotMatch(sheet, /gn-chat-hero[^-]/);
  assert.match(sheet, /gn-translate-badge/);
  assert.match(sheet, /data-layout="chat-services-wifi"/);
  assert.doesNotMatch(css, /\.gn-howto-title/);
  assert.match(css, /\.gn-translate-badge/);
  assert.match(css, /minmax\(22mm,\s*32mm\)/);
  assert.match(sheet, /GUEST_CHAT_NOTICE_QR_MM/);
  assert.match(sheet, /GUEST_CHAT_NOTICE_WIFI_QR_MM/);
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
