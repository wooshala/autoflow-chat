'use client';

// A4 Guest Chat notice — Phase 2 Layout A (Service-first Digital Concierge).
// Content SoT: guestChatNoticeConfig + guestChatNoticeCopy + guestChatNoticeServices.

import {
  GUEST_CHAT_EMERGENCY_PHONE,
  GUEST_CHAT_HOTEL_NAME,
  GUEST_CHAT_NOTICE_QR_MM,
} from '@/lib/guest-spike/guestChatNoticeConfig';
import { guestChatNoticeCopy } from '@/lib/guest-spike/guestChatNoticeCopy';
import {
  GUEST_NOTICE_SERVICE_ICON,
  GUEST_NOTICE_SERVICE_IDS,
} from '@/lib/guest-spike/guestChatNoticeServices';
import { langDisplayName } from '@/lib/guest-spike/languages';

/** Slim language strip (4 primary languages on printed sheet). */
const NOTICE_STRIP_LANGS = ['ko', 'en', 'zh-CN', 'ja'] as const;

const LANG_FLAG: Record<(typeof NOTICE_STRIP_LANGS)[number], string> = {
  ko: '🇰🇷',
  en: '🇺🇸',
  'zh-CN': '🇨🇳',
  ja: '🇯🇵',
};

export type GuestChatNoticeSheetProps = {
  roomNo: string;
  guestUrl: string;
  /** SVG markup from QRCode.toString(..., { type: 'svg' }). */
  qrSvg: string;
  hotelName?: string;
};

export function GuestChatNoticeSheet({
  roomNo,
  guestUrl,
  qrSvg,
  hotelName,
}: GuestChatNoticeSheetProps) {
  const hotel = hotelName?.trim() || GUEST_CHAT_HOTEL_NAME;
  const room = String(roomNo).replace(/[^\d]/g, '') || roomNo;
  const ko = guestChatNoticeCopy.ko;
  const en = guestChatNoticeCopy.en;
  const qrMm = GUEST_CHAT_NOTICE_QR_MM;

  return (
    <main className="guest-notice-sheet" data-guest-notice-sheet="1" data-layout="service-first">
      {/* ① Header */}
      <header className="gn-header">
        <div className="gn-hotel">{hotel}</div>
        <div className="gn-rule" aria-hidden />
        <div className="gn-room">{room}호</div>
        <div className="gn-room-en">Room {room}</div>
        <div className="gn-rule" aria-hidden />
        <h1 className="gn-title">{ko.roomChatSubtitle}</h1>
        <p className="gn-value">{ko.valueLine}</p>
        <p className="gn-value-en">{en.valueLine}</p>
      </header>

      {/* ② Hero QR */}
      <section className="gn-hero" aria-label="QR">
        <div className="gn-hero-side gn-hero-left">
          <div className="gn-hero-icon" aria-hidden>
            📱
          </div>
          <p className="gn-hero-ko">{ko.scanLead}</p>
          <p className="gn-hero-en">{en.scanLead}</p>
        </div>

        <div className="gn-hero-center">
          <div
            className="gn-qr"
            style={{ width: `${qrMm}mm`, height: `${qrMm}mm` }}
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
          <div className="gn-url">{guestUrl}</div>
        </div>

        <div className="gn-hero-side gn-hero-right">
          <div className="gn-hero-icon" aria-hidden>
            💬
          </div>
          <p className="gn-hero-ko">{ko.scanSupport}</p>
          <p className="gn-hero-en">{en.scanSupport}</p>
        </div>
      </section>

      {/* ③ Service grid — Digital Concierge menu */}
      <section className="gn-services" aria-label="Services">
        <h2 className="gn-services-title">{ko.servicesTitle}</h2>
        <ul className="gn-service-grid">
          {GUEST_NOTICE_SERVICE_IDS.map((id) => (
            <li className="gn-service-item" key={id}>
              <span className="gn-service-icon" aria-hidden>
                {GUEST_NOTICE_SERVICE_ICON[id]}
              </span>
              <span className="gn-service-label">{ko.serviceLabels[id]}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* ④ Slim language + auto-translate */}
      <section className="gn-lang-strip" aria-label="Languages">
        <div className="gn-lang-row">
          {NOTICE_STRIP_LANGS.map((lang) => (
            <div className="gn-lang-pill" key={lang}>
              <span className="gn-lang-flag" aria-hidden>
                {LANG_FLAG[lang]}
              </span>
              <span className="gn-lang-name">{langDisplayName(lang)}</span>
              <span className="gn-lang-hint">{guestChatNoticeCopy[lang].helpIntro}</span>
            </div>
          ))}
        </div>
        <div className="gn-translate">
          <span className="gn-translate-badge">{ko.translateBadge}</span>
          <span className="gn-translate-en">{en.translateBadge}</span>
        </div>
      </section>

      {/* ⑤ Trust chips */}
      <section className="gn-trust" aria-label="Trust">
        <div className="gn-trust-chip">
          <span className="gn-trust-icon" aria-hidden>
            👁
          </span>
          <div>
            <div className="gn-trust-ko">{ko.staffWatchBody}</div>
            <div className="gn-trust-en">{en.staffWatchBody}</div>
          </div>
        </div>
        <div className="gn-trust-chip">
          <span className="gn-trust-icon" aria-hidden>
            ⚡
          </span>
          <div>
            <div className="gn-trust-ko">{ko.replyBody}</div>
            <div className="gn-trust-en">{en.replyBody}</div>
          </div>
        </div>
        <div className="gn-trust-chip">
          <span className="gn-trust-icon" aria-hidden>
            🕐
          </span>
          <div>
            <div className="gn-trust-ko">{ko.hoursBody}</div>
            <div className="gn-trust-en">{en.hoursBody}</div>
          </div>
        </div>
        <div className="gn-trust-chip">
          <span className="gn-trust-icon" aria-hidden>
            🔒
          </span>
          <div>
            <div className="gn-trust-ko">{ko.privacyBody}</div>
            <div className="gn-trust-en">{en.privacyBody}</div>
          </div>
        </div>
      </section>

      {/* ⑥ Utility */}
      <section className="gn-bottom">
        <div className="gn-bottom-box gn-wifi">
          <div className="gn-bottom-head">
            <span aria-hidden>📶</span>
            <span>Wi-Fi</span>
          </div>
          <p className="gn-bottom-body">{ko.wifiNightstand}</p>
          <p className="gn-bottom-en">{en.wifiNightstand}</p>
        </div>
        <div className="gn-bottom-box gn-emergency">
          <div className="gn-bottom-head gn-emergency-head">
            <span aria-hidden>📞</span>
            <span>
              {ko.frontDeskLabel} / {ko.emergencyLabel}
            </span>
          </div>
          <p className="gn-emergency-phone">{GUEST_CHAT_EMERGENCY_PHONE}</p>
        </div>
      </section>

      <footer className="gn-footer">
        <span>{ko.afterCheckout}</span>
        <span className="gn-footer-sep" aria-hidden>
          |
        </span>
        <span>{en.afterCheckout}</span>
      </footer>
    </main>
  );
}
