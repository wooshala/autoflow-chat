// Builds a self-contained A4 Guest Chat notice HTML document (batch PDF / unit tests).
// Staff UI print uses React GuestChatNoticeSheet + same-document window.print() instead.
// Content SoT remains guestChatNoticeConfig + guestChatNoticeCopy (do not diverge).

import {
  GUEST_CHAT_EMERGENCY_PHONE,
  GUEST_CHAT_HOTEL_NAME,
  GUEST_CHAT_NOTICE_MARGIN_MM,
  GUEST_CHAT_NOTICE_QR_MM,
} from './guestChatNoticeConfig';
import {
  guestChatNoticeCopy,
  guestChatNoticeLanguageLine,
  type GuestChatNoticeCopy,
} from './guestChatNoticeCopy';
import { SUPPORTED_LANGS, langDisplayName, type GuestLang } from './languages';

export type GuestChatNoticePrintInput = {
  roomNo: string;
  guestUrl: string;
  /** SVG markup from QRCode.toString(..., { type: 'svg' }). */
  qrSvg: string;
  hotelName?: string;
};

function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function multilangBlock(
  pick: (c: GuestChatNoticeCopy) => string,
  opts?: { compact?: boolean },
): string {
  const rows = SUPPORTED_LANGS.map((lang) => {
    const text = pick(guestChatNoticeCopy[lang]);
    return `<div class="ml-row"><span class="ml-lang">${esc(langDisplayName(lang))}</span><span class="ml-text">${esc(text)}</span></div>`;
  });
  return `<div class="ml-block${opts?.compact ? ' compact' : ''}">${rows.join('')}</div>`;
}

/** Staff-facing A4 notice HTML (print + on-screen preview in the popup). */
export function buildGuestChatNoticeHtml(input: GuestChatNoticePrintInput): string {
  const hotel = input.hotelName?.trim() || GUEST_CHAT_HOTEL_NAME;
  const room = String(input.roomNo).replace(/[^\d]/g, '') || input.roomNo;
  const ko = guestChatNoticeCopy.ko;
  const margin = GUEST_CHAT_NOTICE_MARGIN_MM;
  const qrMm = GUEST_CHAT_NOTICE_QR_MM;

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
      color: #111; background: #fff;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    .sheet {
      width: 210mm; min-height: 297mm; margin: 0 auto;
      padding: ${margin}mm; display: flex; flex-direction: column; gap: 4px;
    }
    .toolbar {
      display: flex; gap: 8px; justify-content: flex-end; margin-bottom: 8px;
    }
    .toolbar button {
      font: inherit; font-weight: 700; padding: 8px 14px; border-radius: 8px;
      border: 1px solid #cbd5e1; background: #f8fafc; cursor: pointer;
    }
    .toolbar button.primary { background: #1d4ed8; color: #fff; border-color: #1d4ed8; }
    .hotel { text-align: center; font-size: 18pt; font-weight: 800; letter-spacing: 0.02em; }
    .room { text-align: center; font-size: 24pt; font-weight: 800; margin-top: 1mm; }
    .subtitle { text-align: center; font-size: 11pt; font-weight: 700; color: #1e3a8a; margin-top: 1mm; }
    .lead { text-align: center; margin-top: 3mm; }
    .lead .scan { font-size: 11pt; font-weight: 700; }
    .lead .support { font-size: 9pt; color: #333; margin-top: 1mm; }
    .qr-wrap {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      margin: 3mm 0 1.5mm;
    }
    .qr-wrap .qr {
      width: ${qrMm}mm; height: ${qrMm}mm;
      padding: 2mm;
      display: flex; align-items: center; justify-content: center;
      background: #fff;
    }
    .qr-wrap .qr svg { width: 100%; height: 100%; display: block; }
    .url {
      text-align: center; font-size: 7.5pt; color: #334155; word-break: break-all;
      margin-top: 1.5mm; font-family: ui-monospace, Consolas, monospace;
    }
    .langs {
      text-align: center; font-size: 8pt; font-weight: 700; color: #444;
      border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0;
      padding: 1.8mm 0; margin: 1.5mm 0;
    }
    .section-title {
      font-size: 8pt; font-weight: 800; color: #0f172a; margin: 1.5mm 0 0.8mm;
      text-transform: uppercase; letter-spacing: 0.04em;
    }
    .ml-block { display: flex; flex-direction: column; gap: 0.8mm; }
    .ml-block.compact .ml-text { font-size: 6.8pt; }
    .ml-row { display: grid; grid-template-columns: 26mm 1fr; gap: 1.5mm; align-items: start; }
    .ml-lang { font-size: 6.8pt; font-weight: 800; color: #64748b; }
    .ml-text { font-size: 7.2pt; line-height: 1.3; color: #111; }
    .footer-grid {
      display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 2mm;
      margin-top: 2mm; border-top: 1px solid #e2e8f0; padding-top: 2mm;
    }
    .footer-grid h4 { margin: 0 0 0.8mm; font-size: 8pt; }
    .footer-grid p { margin: 0; font-size: 7pt; color: #333; line-height: 1.3; }
    .emergency {
      text-align: center; margin-top: 2mm; font-size: 11pt; font-weight: 800;
      letter-spacing: 0.02em;
    }
    .after {
      text-align: center; margin-top: 1.5mm; font-size: 7.5pt; color: #475569; line-height: 1.35;
    }
    @media print {
      .toolbar, .no-print { display: none !important; }
      .sheet { width: auto; min-height: auto; padding: 0; }
      html, body { background: #fff; }
    }
    @media screen {
      body { background: #e2e8f0; padding: 16px; }
      .sheet {
        background: #fff; box-shadow: 0 8px 24px rgba(15,23,42,0.12);
      }
    }
  </style>
</head>
<body>
  <div class="toolbar no-print">
    <button type="button" onclick="window.close()">닫기</button>
    <button type="button" class="primary" onclick="window.print()">인쇄</button>
  </div>
  <main class="sheet">
    <div class="hotel">${esc(hotel)}</div>
    <div class="room">${esc(room)}호</div>
    <div class="subtitle">${esc(ko.roomChatSubtitle)}</div>

    <div class="lead">
      <div class="scan">${esc(ko.scanLead)}</div>
      <div class="support">${esc(ko.scanSupport)}</div>
    </div>

    <div class="qr-wrap">
      <div class="qr">${input.qrSvg}</div>
      <div class="url">${esc(input.guestUrl)}</div>
    </div>

    <div class="langs">${esc(guestChatNoticeLanguageLine())}</div>

    <div class="section-title">Help</div>
    ${multilangBlock((c) => `${c.helpIntro} ${c.helpTopics}`, { compact: true })}

    <div class="section-title">Wi-Fi</div>
    ${multilangBlock((c) => c.wifiNightstand, { compact: true })}

    <div class="footer-grid">
      <div>
        <h4>${esc(ko.hoursTitle)}</h4>
        <p>${esc(ko.hoursBody)}</p>
      </div>
      <div>
        <h4>${esc(ko.replyTitle)}</h4>
        <p>${esc(ko.replyBody)}</p>
      </div>
      <div>
        <h4>${esc(ko.privacyTitle)}</h4>
        <p>${esc(ko.privacyBody)}</p>
      </div>
    </div>

    <div class="emergency">${esc(ko.emergencyLabel)}&nbsp;&nbsp;${esc(GUEST_CHAT_EMERGENCY_PHONE)}</div>
    <div class="after">${esc(ko.afterCheckout)}</div>
  </main>
</body>
</html>`;
}

/** Ensure TypeScript still sees every language used on the notice. */
export function assertNoticeCopyComplete(): GuestLang[] {
  return [...SUPPORTED_LANGS];
}
