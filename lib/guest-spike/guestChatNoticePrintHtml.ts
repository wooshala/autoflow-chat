// Builds a self-contained A4 Guest Chat notice HTML document (batch PDF / unit tests).
// Staff UI print uses React GuestChatNoticeSheet + same-document window.print() instead.
// Content SoT remains guestChatNoticeConfig + guestChatNoticeCopy (do not diverge).

import {
  GUEST_CHAT_EMERGENCY_PHONE,
  GUEST_CHAT_HOTEL_NAME,
  GUEST_CHAT_NOTICE_MARGIN_MM,
  GUEST_CHAT_NOTICE_QR_MM,
} from './guestChatNoticeConfig';
import { guestChatNoticeCopy } from './guestChatNoticeCopy';
import { SUPPORTED_LANGS, langDisplayName, type GuestLang } from './languages';

export type GuestChatNoticePrintInput = {
  roomNo: string;
  guestUrl: string;
  /** SVG markup from QRCode.toString(..., { type: 'svg' }). */
  qrSvg: string;
  hotelName?: string;
};

const NOTICE_CARD_LANGS = ['ko', 'en', 'zh-CN', 'ja'] as const;

const LANG_FLAG: Record<(typeof NOTICE_CARD_LANGS)[number], string> = {
  ko: '🇰🇷',
  en: '🇺🇸',
  'zh-CN': '🇨🇳',
  ja: '🇯🇵',
};

const TOPIC_ICONS = ['🧴', '💧', '🧹', '🛎️', '💬'] as const;

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

  const langCards = NOTICE_CARD_LANGS.map((lang) => {
    const c = guestChatNoticeCopy[lang];
    const icons = TOPIC_ICONS.map((icon) => `<li><span class="gn-topic-icon">${icon}</span></li>`).join('');
    return `<article class="gn-lang-card">
      <div class="gn-lang-head"><span class="gn-lang-flag">${LANG_FLAG[lang]}</span><span class="gn-lang-name">${esc(langDisplayName(lang))}</span></div>
      <p class="gn-lang-intro">${esc(c.helpIntro)}</p>
      <p class="gn-lang-topics-text">${esc(c.helpTopics)}</p>
      <div class="gn-lang-divider"></div>
      <ul class="gn-lang-topics">${icons}</ul>
    </article>`;
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
    .toolbar {
      display: flex; gap: 8px; justify-content: flex-end; margin-bottom: 8px;
    }
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
      padding: 11mm 13mm 9mm; display: flex; flex-direction: column; gap: 4mm;
      color: var(--gn-ink); background: #fff;
    }
    .gn-header { text-align: center; }
    .gn-hotel { font-size: 15pt; font-weight: 700; letter-spacing: 0.06em; color: var(--gn-gold); margin-bottom: 2.2mm; }
    .gn-rule { height: 0; border: 0; border-top: 0.35mm solid var(--gn-gold-line); width: 100%; }
    .gn-room { margin-top: 2.2mm; font-size: 32pt; font-weight: 800; line-height: 1.02; }
    .gn-room-en { margin-top: 0.6mm; margin-bottom: 2.2mm; font-size: 11pt; font-weight: 700; color: var(--gn-gold); }
    .gn-title { margin: 2.5mm 0 0; font-size: 16pt; font-weight: 800; color: var(--gn-navy); }
    .gn-title-lead { margin: 1.4mm auto 0; max-width: 145mm; font-size: 9pt; font-weight: 600; color: var(--gn-muted); line-height: 1.35; }
    .gn-hero { display: grid; grid-template-columns: 1fr auto 1fr; gap: 3.5mm; align-items: center; }
    .gn-hero-side { text-align: center; padding: 0 1mm; }
    .gn-hero-icon { font-size: 18pt; margin-bottom: 1.8mm; }
    .gn-hero-ko { margin: 0; font-size: 8.5pt; font-weight: 700; line-height: 1.35; }
    .gn-hero-en { margin: 1.2mm 0 0; font-size: 7pt; color: var(--gn-muted); line-height: 1.3; }
    .gn-hero-center { display: flex; flex-direction: column; align-items: center; }
    .gn-qr {
      width: ${qrMm}mm; height: ${qrMm}mm; padding: 2mm; box-sizing: border-box;
      background: #fff; border: 0.45mm solid #0f172a;
      display: flex; align-items: center; justify-content: center;
    }
    .gn-qr svg { width: 100%; height: 100%; display: block; }
    .gn-url {
      margin-top: 2mm; max-width: 68mm; padding: 1.3mm 3mm; border-radius: 999px;
      background: var(--gn-url); color: var(--gn-navy); font-size: 6.2pt; font-weight: 600;
      font-family: ui-monospace, Consolas, monospace; word-break: break-all; text-align: center;
    }
    .gn-cta { margin: 2.2mm 0 0; max-width: 72mm; text-align: center; font-size: 8.2pt; font-weight: 700; color: var(--gn-navy); line-height: 1.35; }
    .gn-langs { display: grid; grid-template-columns: repeat(4, 1fr); border: 0.35mm solid var(--gn-card-border); border-radius: 2.2mm; overflow: hidden; }
    .gn-lang-card { padding: 2.4mm 2.2mm; border-right: 0.3mm solid var(--gn-card-border); }
    .gn-lang-card:last-child { border-right: 0; }
    .gn-lang-head { display: flex; align-items: center; justify-content: center; gap: 1.2mm; margin-bottom: 1.4mm; }
    .gn-lang-name { font-size: 8.2pt; font-weight: 800; color: var(--gn-navy); }
    .gn-lang-intro { margin: 0; font-size: 6.4pt; font-weight: 600; text-align: center; line-height: 1.35; }
    .gn-lang-topics-text { margin: 1mm 0 0; font-size: 5.6pt; color: var(--gn-muted); text-align: center; line-height: 1.3; }
    .gn-lang-divider { border: 0; border-top: 0.25mm solid #e5e7eb; margin: 1.6mm 0 1.4mm; }
    .gn-lang-topics { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; align-items: center; gap: 1mm; }
    .gn-topic-icon { font-size: 10pt; }
    .gn-info { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2.5mm; }
    .gn-info-card { background: var(--gn-info); border-radius: 2mm; padding: 2.8mm 2.2mm; text-align: center; border: 0.25mm solid #e0e7ff; }
    .gn-info-icon { font-size: 13pt; margin-bottom: 1.2mm; }
    .gn-info-title { font-size: 8.5pt; font-weight: 800; color: var(--gn-navy); margin-bottom: 1mm; }
    .gn-info-body { font-size: 6.8pt; font-weight: 600; line-height: 1.35; }
    .gn-info-en { margin-top: 0.8mm; font-size: 5.8pt; color: var(--gn-muted); line-height: 1.3; }
    .gn-bottom { display: grid; grid-template-columns: 1.4fr 1fr; gap: 2.5mm; }
    .gn-bottom-box { border: 0.35mm solid #d1d5db; border-radius: 2mm; padding: 2.6mm 3mm; background: var(--gn-box); }
    .gn-bottom-head { display: flex; align-items: center; gap: 1.5mm; font-size: 9pt; font-weight: 800; margin-bottom: 1.5mm; }
    .gn-bottom-body { margin: 0; font-size: 7pt; color: var(--gn-muted); line-height: 1.4; }
    .gn-emergency-head { color: var(--gn-danger); }
    .gn-emergency-phone { margin: 0.5mm 0 0; font-size: 15pt; font-weight: 800; color: var(--gn-danger); }
    .gn-footer {
      margin-top: auto; padding-top: 1.5mm; border-top: 0.25mm solid #e5e7eb;
      text-align: center; font-size: 6.5pt; color: #6b7280; display: flex; flex-wrap: wrap; justify-content: center; gap: 1.5mm;
    }
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
  <main class="guest-notice-sheet" data-guest-notice-sheet="1">
    <header class="gn-header">
      <div class="gn-hotel">${esc(hotel)}</div>
      <div class="gn-rule"></div>
      <div class="gn-room">${esc(room)}호</div>
      <div class="gn-room-en">Room ${esc(room)}</div>
      <div class="gn-rule"></div>
      <h1 class="gn-title">${esc(ko.roomChatSubtitle)}</h1>
      <p class="gn-title-lead">${esc(ko.helpIntro)}</p>
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
        <p class="gn-cta">${esc(ko.helpTopics)}</p>
      </div>
      <div class="gn-hero-side">
        <div class="gn-hero-icon">💬</div>
        <p class="gn-hero-ko">${esc(ko.scanSupport)}</p>
        <p class="gn-hero-en">${esc(en.scanSupport)}</p>
      </div>
    </section>
    <section class="gn-langs">${langCards}</section>
    <section class="gn-info">
      <div class="gn-info-card">
        <div class="gn-info-icon">🕐</div>
        <div class="gn-info-title">${esc(ko.hoursTitle)}</div>
        <div class="gn-info-body">${esc(ko.hoursBody)}</div>
        <div class="gn-info-en">${esc(en.hoursBody)}</div>
      </div>
      <div class="gn-info-card">
        <div class="gn-info-icon">💬</div>
        <div class="gn-info-title">${esc(ko.replyTitle)}</div>
        <div class="gn-info-body">${esc(ko.replyBody)}</div>
        <div class="gn-info-en">${esc(en.replyBody)}</div>
      </div>
      <div class="gn-info-card">
        <div class="gn-info-icon">🔒</div>
        <div class="gn-info-title">${esc(ko.privacyTitle)}</div>
        <div class="gn-info-body">${esc(ko.privacyBody)}</div>
        <div class="gn-info-en">${esc(en.privacyBody)}</div>
      </div>
    </section>
    <section class="gn-bottom">
      <div class="gn-bottom-box">
        <div class="gn-bottom-head"><span>📶</span><span>Wi-Fi</span></div>
        <p class="gn-bottom-body">${esc(ko.wifiNightstand)}</p>
      </div>
      <div class="gn-bottom-box">
        <div class="gn-bottom-head gn-emergency-head"><span>📞</span><span>${esc(ko.emergencyLabel)} (${esc(en.emergencyLabel)})</span></div>
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

/** Ensure TypeScript still sees every language used on the notice. */
export function assertNoticeCopyComplete(): GuestLang[] {
  return [...SUPPORTED_LANGS];
}
