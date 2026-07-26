// Builds a self-contained A4 Guest Chat notice HTML document (batch PDF / unit tests).
// Staff UI print uses React GuestChatNoticeSheet + same-document window.print() instead.
// Final Polish: chat-first hierarchy, no visible URL, per-band Wi-Fi credentials, stroke SVG icons.

import {
  GUEST_CHAT_EMERGENCY_PHONE,
  GUEST_CHAT_HOTEL_NAME,
  GUEST_CHAT_NOTICE_MARGIN_MM,
  GUEST_CHAT_NOTICE_WIFI_QR_MM,
} from './guestChatNoticeConfig';
import { guestChatNoticeCopy } from './guestChatNoticeCopy';
import {
  GUEST_NOTICE_PHONE_ICON,
  GUEST_NOTICE_WIFI_ICON,
} from './guestChatNoticeIcons';
import {
  GUEST_NOTICE_GUIDE_REF_QR_BOX,
  loadGuestNoticeGuideRefDataUri,
} from './guestChatNoticeGuideRef';
import {
  GUEST_NOTICE_SERVICE_ICON,
  GUEST_NOTICE_SERVICE_IDS,
} from './guestChatNoticeServices';
import { roomWifiFor } from './roomWifiCredentials.generated';
import { SUPPORTED_LANGS, type GuestLang } from './languages';

export type GuestChatNoticePrintInput = {
  roomNo: string;
  guestUrl: string;
  qrSvg: string;
  hotelName?: string;
  wifiQrSvg5g?: string | null;
  wifiQrSvg24?: string | null;
};

function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function wifiBandCard(
  label: string,
  ssid: string,
  password: string,
  passwordLabel: string,
  svg: string | null | undefined,
  mm: number,
): string {
  const body = svg
    ? `<div class="gn-qr gn-qr-wifi" style="width:${mm}mm;height:${mm}mm">${svg}</div>`
    : `<div class="gn-wifi-ph" style="width:${mm}mm;height:${mm}mm">Wi-Fi</div>`;
  return `<div class="gn-wifi-band-card">
      <div class="gn-wifi-band">${esc(label)}</div>
      ${body}
      <div class="gn-wifi-cred">
        <div class="gn-wifi-cred-row"><span class="gn-wifi-cred-k">SSID</span><span class="gn-wifi-cred-v gn-wifi-ssid">${esc(ssid)}</span></div>
        <div class="gn-wifi-cred-row"><span class="gn-wifi-cred-k">${esc(passwordLabel)}</span><span class="gn-wifi-cred-v gn-wifi-cred-pw">${esc(password)}</span></div>
      </div>
    </div>`;
}

/** Staff-facing A4 notice HTML (print + on-screen preview in the popup). */
export function buildGuestChatNoticeHtml(input: GuestChatNoticePrintInput): string {
  const hotel = input.hotelName?.trim() || GUEST_CHAT_HOTEL_NAME;
  const room = String(input.roomNo).replace(/[^\d]/g, '') || input.roomNo;
  const ko = guestChatNoticeCopy.ko;
  const en = guestChatNoticeCopy.en;
  const margin = GUEST_CHAT_NOTICE_MARGIN_MM;
  const wifiMm = GUEST_CHAT_NOTICE_WIFI_QR_MM;
  const wifi = roomWifiFor(room);
  const guideRef = loadGuestNoticeGuideRefDataUri();
  const qrBox = GUEST_NOTICE_GUIDE_REF_QR_BOX;

  const services = GUEST_NOTICE_SERVICE_IDS.map(
    (id) =>
      `<li class="gn-service-item"><span class="gn-service-icon">${GUEST_NOTICE_SERVICE_ICON[id]}</span><span class="gn-service-label">${esc(ko.serviceLabels[id])}</span><span class="gn-service-label-en">${esc(en.serviceLabels[id])}</span></li>`,
  ).join('');

  const wifiMid = `<div class="gn-wifi-aux-mid">
        <div class="gn-wifi-aux-title-row">
          <span class="gn-wifi-icon">${GUEST_NOTICE_WIFI_ICON}</span>
          <span class="gn-wifi-aux-title">${esc(ko.wifiPanelTitle)}</span>
        </div>
        <span class="gn-wifi-aux-hint">${esc(ko.wifiScanHint)}</span>
      </div>`;

  const wifiBlock = wifi
    ? `<div class="gn-wifi-aux-qrs">
        ${wifiBandCard(ko.wifi5gLabel, wifi.ssid5g, wifi.password, ko.wifiPasswordLabel, input.wifiQrSvg5g, wifiMm)}
        ${wifiMid}
        ${wifiBandCard(ko.wifi24Label, wifi.ssid24, wifi.password, ko.wifiPasswordLabel, input.wifiQrSvg24, wifiMm)}
      </div>`
    : `<div class="gn-wifi-aux-head">
        <div class="gn-wifi-aux-title-row">
          <span class="gn-wifi-icon">${GUEST_NOTICE_WIFI_ICON}</span>
          <span class="gn-wifi-aux-title">${esc(ko.wifiPanelTitle)}</span>
        </div>
        <span class="gn-wifi-aux-hint">${esc(ko.wifiScanHint)}</span>
      </div>
      <p class="gn-wifi-missing">${esc(ko.wifiNightstand)}</p>`;

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>${esc(hotel)} · ${esc(room)}호 Guest Chat</title>
  <style>
    @page { size: A4 portrait; margin: ${margin}mm; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0; padding: 0;
      font-family: "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif;
      color: #111827; background: #fff;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    .toolbar { display: flex; gap: 8px; justify-content: flex-end; margin-bottom: 8px; }
    .toolbar button {
      font: inherit; font-weight: 700; padding: 8px 14px; border-radius: 8px;
      border: 1px solid #cbd5e1; background: #f8fafc; cursor: pointer;
    }
    .toolbar button.primary { background: #1d4ed8; color: #fff; border-color: #1d4ed8; }
    .guest-notice-sheet {
      --gn-navy: #1e3a8a; --gn-gold: #b45309; --gn-gold-line: #d4a574;
      --gn-ink: #111827; --gn-muted: #4b5563; --gn-soft: #f8fafc; --gn-box: #f3f4f6;
      --gn-info: #eef2ff; --gn-danger: #b91c1c; --gn-card-border: #e8e8ee; --gn-icon: #475569;
      box-sizing: border-box; width: 210mm; min-height: 297mm; margin: 0 auto;
      padding: 5mm 8mm 5mm; display: flex; flex-direction: column; gap: 2mm;
      color: var(--gn-ink); background: #fff;
    }
    .gn-header { text-align: center; }
    .gn-header-compact .gn-hotel { font-size: 10.5pt; font-weight: 700; letter-spacing: 0.08em; color: var(--gn-gold); margin-bottom: 0.8mm; }
    .gn-rule { height: 0; border: 0; border-top: 0.3mm solid var(--gn-gold-line); width: 100%; opacity: 0.85; }
    .gn-header-compact .gn-room { margin-top: 0.8mm; font-size: 20pt; font-weight: 800; line-height: 1.02; }
    .gn-header-compact .gn-room-en { margin-top: 0.3mm; margin-bottom: 0.4mm; font-size: 8pt; font-weight: 600; letter-spacing: 0.04em; color: var(--gn-gold); }
    .gn-concierge { display: flex; flex-direction: column; padding: 0; background: transparent; border: 0; }
    .gn-guide-ref { position: relative; width: 100%; line-height: 0; }
    .gn-guide-ref-img { width: 100%; height: auto; display: block; border-radius: 1.5mm; border: 0.25mm solid var(--gn-card-border); }
    .gn-guide-ref-qr { position: absolute; box-sizing: border-box; aspect-ratio: 1 / 1; height: auto; padding: 0.6mm; background: #fff; border: 0.35mm solid #0f172a; display: flex; align-items: center; justify-content: center; z-index: 2; left: ${qrBox.leftPct}%; top: ${qrBox.topPct}%; width: ${qrBox.widthPct}%; }
    .gn-guide-ref-qr svg { width: 100%; height: 100%; display: block; }
    .gn-qr { padding: 1.4mm; box-sizing: border-box; background: #fff; border: 0.45mm solid #0f172a; display: flex; align-items: center; justify-content: center; }
    .gn-qr-wifi { border-width: 0.28mm; border-color: #94a3b8; padding: 1mm; }
    .gn-qr svg { width: 100%; height: 100%; display: block; }
    .gn-wifi-aux { background: var(--gn-soft); border: 0.25mm solid var(--gn-card-border); border-radius: 1.8mm; padding: 1.4mm 1.8mm; }
    .gn-wifi-aux-head { text-align: center; margin-bottom: 1.5mm; }
    .gn-wifi-aux-title-row { display: inline-flex; align-items: center; justify-content: center; gap: 1mm; flex-wrap: wrap; }
    .gn-wifi-aux-mid { display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; max-width: 32mm; padding: 0 1mm; gap: 1mm; align-self: center; }
    .gn-wifi-aux-mid .gn-wifi-aux-title-row { flex-direction: column; gap: 0.6mm; }
    .gn-wifi-icon { display: inline-flex; width: 3.2mm; height: 3.2mm; color: var(--gn-icon); }
    .gn-wifi-icon svg { width: 100%; height: 100%; display: block; }
    .gn-wifi-aux-title { font-size: 7.5pt; font-weight: 800; color: var(--gn-muted); line-height: 1.2; }
    .gn-wifi-aux-hint { display: block; font-size: 5.5pt; color: #6b7280; line-height: 1.35; max-width: 30mm; word-break: keep-all; }
    .gn-wifi-aux-qrs { display: grid; grid-template-columns: 1fr minmax(22mm, 32mm) 1fr; gap: 2mm; align-items: stretch; }
    .gn-wifi-band-card { display: flex; flex-direction: column; align-items: center; text-align: center; background: #fff; border: 0.2mm solid #e5e7eb; border-radius: 1.6mm; padding: 1.6mm 2mm 1.8mm; }
    .gn-wifi-band { font-size: 6.5pt; font-weight: 800; margin-bottom: 1mm; }
    .gn-wifi-cred { width: 100%; margin-top: 1.2mm; display: flex; flex-direction: column; gap: 1mm; }
    .gn-wifi-cred-row { display: flex; flex-direction: column; gap: 0.3mm; align-items: center; }
    .gn-wifi-cred-k { font-size: 4.8pt; font-weight: 800; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.06em; }
    .gn-wifi-ssid { font-size: 5.5pt; font-weight: 600; font-family: ui-monospace, Consolas, monospace; color: var(--gn-muted); word-break: break-all; }
    .gn-wifi-cred-pw { font-size: 8.5pt; font-weight: 800; font-family: ui-monospace, Consolas, monospace; letter-spacing: 0.04em; }
    .gn-wifi-ph { box-sizing: border-box; display: flex; align-items: center; justify-content: center; background: #eef2f7; color: #6b7280; font-size: 6pt; font-weight: 700; border: 0.25mm dashed #94a3b8; border-radius: 1mm; }
    .gn-wifi-missing { text-align: center; font-size: 6.5pt; color: var(--gn-muted); }
    .gn-services { border: 0.25mm solid var(--gn-card-border); border-radius: 1.8mm; padding: 1.8mm 2mm 1.6mm; }
    .gn-services-title { margin: 0 0 1.4mm; text-align: center; font-size: 9pt; font-weight: 800; color: var(--gn-navy); }
    .gn-service-grid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(6, 1fr); gap: 1.4mm 1mm; }
    .gn-service-item { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 0.4mm; }
    .gn-service-icon { display: inline-flex; width: 4.2mm; height: 4.2mm; color: var(--gn-icon); }
    .gn-service-icon svg { width: 100%; height: 100%; display: block; }
    .gn-service-label { font-size: 6.5pt; font-weight: 700; line-height: 1.15; word-break: keep-all; }
    .gn-service-label-en { font-size: 5.5pt; font-weight: 600; color: var(--gn-muted); line-height: 1.15; word-break: break-word; }
    .gn-translate { margin-top: 1.2mm; display: flex; justify-content: center; align-items: baseline; gap: 2mm; flex-wrap: wrap; }
    .gn-translate-badge { font-size: 7pt; font-weight: 800; color: var(--gn-navy); background: var(--gn-info); border: 0.2mm solid #dce3ff; border-radius: 999px; padding: 0.4mm 2mm; }
    .gn-translate-en { font-size: 6pt; color: var(--gn-muted); font-weight: 600; }
    .gn-bottom { display: grid; grid-template-columns: 1fr; max-width: 88mm; margin: 0 auto; width: 100%; }
    .gn-bottom-box { border: 0.25mm solid #e5e7eb; border-radius: 1.8mm; padding: 1.6mm 2.2mm; background: var(--gn-soft); }
    .gn-bottom-head { display: flex; align-items: center; justify-content: center; gap: 1.2mm; font-size: 7.5pt; font-weight: 800; margin-bottom: 0.6mm; color: var(--gn-danger); }
    .gn-phone-icon { display: inline-flex; width: 3.2mm; height: 3.2mm; color: var(--gn-danger); }
    .gn-phone-icon svg { width: 100%; height: 100%; display: block; }
    .gn-emergency-phone { margin: 0; text-align: center; font-size: 12pt; font-weight: 800; color: var(--gn-danger); }
    .gn-footer { margin-top: auto; padding-top: 1mm; border-top: 0.2mm solid #eceff3; text-align: center; font-size: 5.8pt; color: #6b7280; display: flex; flex-wrap: wrap; justify-content: center; gap: 1.2mm; }
    .gn-footer-sep { color: #d1d5db; }
    @media print {
      .toolbar, .no-print { display: none !important; }
      .guest-notice-sheet { width: auto; min-height: auto; padding: 0; }
      html, body { background: #fff; }
    }
    @media screen {
      body { background: #e2e8f0; padding: 16px; }
      .guest-notice-sheet { box-shadow: 0 8px 24px rgba(15,23,42,0.12); }
    }
  </style>
</head>
<body>
  <div class="toolbar no-print">
    <button type="button" onclick="window.close()">닫기</button>
    <button type="button" class="primary" onclick="window.print()">인쇄</button>
  </div>
  <main class="guest-notice-sheet" data-guest-notice-sheet="1" data-layout="chat-services-wifi">
    <header class="gn-header gn-header-compact">
      <div class="gn-hotel">${esc(hotel)}</div>
      <div class="gn-rule"></div>
      <div class="gn-room">${esc(room)}호</div>
      <div class="gn-room-en">Room ${esc(room)}</div>
    </header>
    <div class="gn-concierge gn-concierge-ref" data-guest-url="${esc(input.guestUrl)}">
      <section class="gn-guide-ref">
        <img class="gn-guide-ref-img" src="${guideRef}" alt="Guest Chat guide" />
        <div class="gn-guide-ref-qr gn-qr gn-qr-chat">${input.qrSvg}</div>
      </section>
    </div>
    <section class="gn-services">
      <h2 class="gn-services-title">${esc(ko.servicesTitle)}</h2>
      <ul class="gn-service-grid">${services}</ul>
      <div class="gn-translate">
        <span class="gn-translate-badge">${esc(ko.translateBadge)}</span>
        <span class="gn-translate-en">${esc(en.translateBadge)}</span>
      </div>
    </section>
    <section class="gn-wifi-aux">
      ${wifiBlock}
    </section>
    <section class="gn-bottom">
      <div class="gn-bottom-box">
        <div class="gn-bottom-head"><span class="gn-phone-icon">${GUEST_NOTICE_PHONE_ICON}</span><span>${esc(ko.frontDeskLabel)} / ${esc(ko.emergencyLabel)}</span></div>
        <p class="gn-emergency-phone">${esc(GUEST_CHAT_EMERGENCY_PHONE)}</p>
      </div>
    </section>
    <footer class="gn-footer">
      <span>${esc(ko.afterCheckout)}</span>
      <span class="gn-footer-sep">|</span>
      <span>${esc(en.afterCheckout)}</span>
    </footer>
  </main>
</body>
</html>`;
}

export function assertNoticeCopyComplete(): GuestLang[] {
  return [...SUPPORTED_LANGS];
}
