// Builds a self-contained A4 Guest Chat notice HTML document (batch PDF / unit tests).
// Staff UI print uses React GuestChatNoticeSheet + same-document window.print() instead.
// Layout: Phase 2 Service-first (Digital Concierge). Content SoT must not diverge.

import {
  GUEST_CHAT_EMERGENCY_PHONE,
  GUEST_CHAT_HOTEL_NAME,
  GUEST_CHAT_NOTICE_MARGIN_MM,
  GUEST_CHAT_NOTICE_QR_MM,
} from './guestChatNoticeConfig';
import { guestChatNoticeCopy } from './guestChatNoticeCopy';
import {
  GUEST_NOTICE_SERVICE_ICON,
  GUEST_NOTICE_SERVICE_IDS,
} from './guestChatNoticeServices';
import { SUPPORTED_LANGS, langDisplayName, type GuestLang } from './languages';

export type GuestChatNoticePrintInput = {
  roomNo: string;
  guestUrl: string;
  qrSvg: string;
  hotelName?: string;
};

const NOTICE_STRIP_LANGS = ['ko', 'en', 'zh-CN', 'ja'] as const;

const LANG_FLAG: Record<(typeof NOTICE_STRIP_LANGS)[number], string> = {
  ko: '🇰🇷',
  en: '🇺🇸',
  'zh-CN': '🇨🇳',
  ja: '🇯🇵',
};

function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Staff-facing A4 notice HTML (print + on-screen preview in the popup). */
export function buildGuestChatNoticeHtml(input: GuestChatNoticePrintInput): string {
  const hotel = input.hotelName?.trim() || GUEST_CHAT_HOTEL_NAME;
  const room = String(input.roomNo).replace(/[^\d]/g, '') || input.roomNo;
  const ko = guestChatNoticeCopy.ko;
  const en = guestChatNoticeCopy.en;
  const margin = GUEST_CHAT_NOTICE_MARGIN_MM;
  const qrMm = GUEST_CHAT_NOTICE_QR_MM;

  const services = GUEST_NOTICE_SERVICE_IDS.map(
    (id) =>
      `<li class="gn-service-item"><span class="gn-service-icon">${GUEST_NOTICE_SERVICE_ICON[id]}</span><span class="gn-service-label">${esc(ko.serviceLabels[id])}</span></li>`,
  ).join('');

  const langPills = NOTICE_STRIP_LANGS.map((lang) => {
    const c = guestChatNoticeCopy[lang];
    return `<div class="gn-lang-pill"><span class="gn-lang-flag">${LANG_FLAG[lang]}</span><span class="gn-lang-name">${esc(langDisplayName(lang))}</span><span class="gn-lang-hint">${esc(c.helpIntro)}</span></div>`;
  }).join('');

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
      --gn-ink: #111827; --gn-muted: #4b5563; --gn-box: #f3f4f6;
      --gn-info: #eef2ff; --gn-url: #dbeafe; --gn-danger: #b91c1c; --gn-card-border: #e5e7eb;
      box-sizing: border-box; width: 210mm; min-height: 297mm; margin: 0 auto;
      padding: 9mm 12mm 8mm; display: flex; flex-direction: column; gap: 3.2mm;
      color: var(--gn-ink); background: #fff;
    }
    .gn-header { text-align: center; }
    .gn-hotel { font-size: 13pt; font-weight: 700; letter-spacing: 0.06em; color: var(--gn-gold); margin-bottom: 1.8mm; }
    .gn-rule { height: 0; border: 0; border-top: 0.35mm solid var(--gn-gold-line); width: 100%; }
    .gn-room { margin-top: 1.8mm; font-size: 28pt; font-weight: 800; line-height: 1.02; }
    .gn-room-en { margin-top: 0.4mm; margin-bottom: 1.8mm; font-size: 10pt; font-weight: 700; color: var(--gn-gold); }
    .gn-title { margin: 2mm 0 0; font-size: 14pt; font-weight: 800; color: var(--gn-navy); }
    .gn-value { margin: 1.4mm auto 0; max-width: 160mm; font-size: 10pt; font-weight: 700; line-height: 1.3; }
    .gn-value-en { margin: 0.6mm auto 0; max-width: 160mm; font-size: 7.5pt; color: var(--gn-muted); }
    .gn-hero { display: grid; grid-template-columns: 1fr auto 1fr; gap: 3mm; align-items: center; }
    .gn-hero-side { text-align: center; }
    .gn-hero-icon { font-size: 16pt; margin-bottom: 1.4mm; }
    .gn-hero-ko { margin: 0; font-size: 8pt; font-weight: 700; line-height: 1.35; }
    .gn-hero-en { margin: 1mm 0 0; font-size: 6.5pt; color: var(--gn-muted); }
    .gn-hero-center { display: flex; flex-direction: column; align-items: center; }
    .gn-qr {
      width: ${qrMm}mm; height: ${qrMm}mm; padding: 2mm; box-sizing: border-box;
      background: #fff; border: 0.45mm solid #0f172a;
      display: flex; align-items: center; justify-content: center;
    }
    .gn-qr svg { width: 100%; height: 100%; display: block; }
    .gn-url {
      margin-top: 1.6mm; max-width: 68mm; padding: 1.1mm 2.8mm; border-radius: 999px;
      background: var(--gn-url); color: var(--gn-navy); font-size: 5.8pt; font-weight: 600;
      font-family: ui-monospace, Consolas, monospace; word-break: break-all; text-align: center;
    }
    .gn-services { border: 0.35mm solid var(--gn-card-border); border-radius: 2mm; padding: 2.4mm 2.5mm; }
    .gn-services-title { margin: 0 0 2mm; text-align: center; font-size: 9pt; font-weight: 800; color: var(--gn-navy); }
    .gn-service-grid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(6, 1fr); gap: 1.6mm 1.2mm; }
    .gn-service-item { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 0.8mm; }
    .gn-service-icon { font-size: 13pt; }
    .gn-service-label { font-size: 6pt; font-weight: 700; }
    .gn-lang-strip { border: 0.3mm solid var(--gn-card-border); border-radius: 2mm; padding: 2mm 2.2mm; background: var(--gn-box); }
    .gn-lang-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1.5mm; }
    .gn-lang-pill { background: #fff; border-radius: 1.5mm; padding: 1.6mm 1.2mm; text-align: center; border: 0.2mm solid #e5e7eb; }
    .gn-lang-flag { font-size: 9pt; display: block; margin-bottom: 0.6mm; }
    .gn-lang-name { display: block; font-size: 7.5pt; font-weight: 800; color: var(--gn-navy); }
    .gn-lang-hint { display: block; margin-top: 0.8mm; font-size: 5.5pt; color: var(--gn-muted); line-height: 1.25; }
    .gn-translate { margin-top: 1.6mm; display: flex; justify-content: center; align-items: baseline; gap: 2mm; flex-wrap: wrap; }
    .gn-translate-badge { font-size: 8pt; font-weight: 800; color: var(--gn-navy); background: var(--gn-info); border: 0.25mm solid #c7d2fe; border-radius: 999px; padding: 0.8mm 3mm; }
    .gn-translate-en { font-size: 6.5pt; color: var(--gn-muted); font-weight: 600; }
    .gn-trust { display: grid; grid-template-columns: repeat(4, 1fr); gap: 2mm; }
    .gn-trust-chip { display: flex; gap: 1.4mm; background: var(--gn-info); border-radius: 1.8mm; padding: 2mm 1.8mm; border: 0.2mm solid #e0e7ff; }
    .gn-trust-icon { font-size: 10pt; }
    .gn-trust-ko { font-size: 6.5pt; font-weight: 700; line-height: 1.3; }
    .gn-trust-en { margin-top: 0.5mm; font-size: 5.4pt; color: var(--gn-muted); }
    .gn-bottom { display: grid; grid-template-columns: 1.2fr 1fr; gap: 2.2mm; }
    .gn-bottom-box { border: 0.35mm solid #d1d5db; border-radius: 2mm; padding: 2.2mm 2.8mm; background: var(--gn-box); }
    .gn-bottom-head { display: flex; align-items: center; gap: 1.4mm; font-size: 8.5pt; font-weight: 800; margin-bottom: 1.2mm; }
    .gn-bottom-body { margin: 0; font-size: 7.5pt; font-weight: 600; line-height: 1.35; }
    .gn-bottom-en { margin: 0.6mm 0 0; font-size: 6pt; color: var(--gn-muted); }
    .gn-emergency-head { color: var(--gn-danger); }
    .gn-emergency-phone { margin: 0.4mm 0 0; font-size: 13pt; font-weight: 800; color: var(--gn-danger); }
    .gn-footer { margin-top: auto; padding-top: 1.2mm; border-top: 0.25mm solid #e5e7eb; text-align: center; font-size: 6pt; color: #6b7280; display: flex; flex-wrap: wrap; justify-content: center; gap: 1.4mm; }
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
  <main class="guest-notice-sheet" data-guest-notice-sheet="1" data-layout="service-first">
    <header class="gn-header">
      <div class="gn-hotel">${esc(hotel)}</div>
      <div class="gn-rule"></div>
      <div class="gn-room">${esc(room)}호</div>
      <div class="gn-room-en">Room ${esc(room)}</div>
      <div class="gn-rule"></div>
      <h1 class="gn-title">${esc(ko.roomChatSubtitle)}</h1>
      <p class="gn-value">${esc(ko.valueLine)}</p>
      <p class="gn-value-en">${esc(en.valueLine)}</p>
    </header>
    <section class="gn-hero">
      <div class="gn-hero-side">
        <div class="gn-hero-icon">📱</div>
        <p class="gn-hero-ko">${esc(ko.scanLead)}</p>
        <p class="gn-hero-en">${esc(en.scanLead)}</p>
      </div>
      <div class="gn-hero-center">
        <div class="gn-qr" style="width:${qrMm}mm;height:${qrMm}mm">${input.qrSvg}</div>
        <div class="gn-url">${esc(input.guestUrl)}</div>
      </div>
      <div class="gn-hero-side">
        <div class="gn-hero-icon">💬</div>
        <p class="gn-hero-ko">${esc(ko.scanSupport)}</p>
        <p class="gn-hero-en">${esc(en.scanSupport)}</p>
      </div>
    </section>
    <section class="gn-services">
      <h2 class="gn-services-title">${esc(ko.servicesTitle)}</h2>
      <ul class="gn-service-grid">${services}</ul>
    </section>
    <section class="gn-lang-strip">
      <div class="gn-lang-row">${langPills}</div>
      <div class="gn-translate">
        <span class="gn-translate-badge">${esc(ko.translateBadge)}</span>
        <span class="gn-translate-en">${esc(en.translateBadge)}</span>
      </div>
    </section>
    <section class="gn-trust">
      <div class="gn-trust-chip"><span class="gn-trust-icon">👁</span><div><div class="gn-trust-ko">${esc(ko.staffWatchBody)}</div><div class="gn-trust-en">${esc(en.staffWatchBody)}</div></div></div>
      <div class="gn-trust-chip"><span class="gn-trust-icon">⚡</span><div><div class="gn-trust-ko">${esc(ko.replyBody)}</div><div class="gn-trust-en">${esc(en.replyBody)}</div></div></div>
      <div class="gn-trust-chip"><span class="gn-trust-icon">🕐</span><div><div class="gn-trust-ko">${esc(ko.hoursBody)}</div><div class="gn-trust-en">${esc(en.hoursBody)}</div></div></div>
      <div class="gn-trust-chip"><span class="gn-trust-icon">🔒</span><div><div class="gn-trust-ko">${esc(ko.privacyBody)}</div><div class="gn-trust-en">${esc(en.privacyBody)}</div></div></div>
    </section>
    <section class="gn-bottom">
      <div class="gn-bottom-box">
        <div class="gn-bottom-head"><span>📶</span><span>Wi-Fi</span></div>
        <p class="gn-bottom-body">${esc(ko.wifiNightstand)}</p>
        <p class="gn-bottom-en">${esc(en.wifiNightstand)}</p>
      </div>
      <div class="gn-bottom-box">
        <div class="gn-bottom-head gn-emergency-head"><span>📞</span><span>${esc(ko.frontDeskLabel)} / ${esc(ko.emergencyLabel)}</span></div>
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
