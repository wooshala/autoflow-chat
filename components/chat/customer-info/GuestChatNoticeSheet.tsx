'use client';

// A4 Guest Chat notice sheet — layout follows hotel Guest Information Sheet design.
// Content SoT: guestChatNoticeConfig + guestChatNoticeCopy (do not duplicate strings).

import {
  GUEST_CHAT_EMERGENCY_PHONE,
  GUEST_CHAT_HOTEL_NAME,
  GUEST_CHAT_NOTICE_QR_MM,
} from '@/lib/guest-spike/guestChatNoticeConfig';
import { guestChatNoticeCopy } from '@/lib/guest-spike/guestChatNoticeCopy';
import { langDisplayName } from '@/lib/guest-spike/languages';

/** Primary language cards on the printed sheet (matches design 4-column grid). */
const NOTICE_CARD_LANGS = ['ko', 'en', 'zh-CN', 'ja'] as const;

/** Flag emoji — visual cue only; language name comes from langDisplayName SoT. */
const LANG_FLAG: Record<(typeof NOTICE_CARD_LANGS)[number], string> = {
  ko: '🇰🇷',
  en: '🇺🇸',
  'zh-CN': '🇨🇳',
  ja: '🇯🇵',
};

/**
 * Icon row — language-agnostic visual cues for amenity topics.
 * Prose remains in SoT (helpIntro / helpTopics); do not invent per-language labels here.
 */
const TOPIC_ICONS = [
  { icon: '🧴', tip: 'amenity' },
  { icon: '💧', tip: 'water' },
  { icon: '🧹', tip: 'clean' },
  { icon: '🛎️', tip: 'facility' },
  { icon: '💬', tip: 'other' },
] as const;

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
    <main className="guest-notice-sheet" data-guest-notice-sheet="1">
      {/* ① Header */}
      <header className="gn-header">
        <div className="gn-hotel">{hotel}</div>
        <div className="gn-rule" aria-hidden />
        <div className="gn-room">{room}호</div>
        <div className="gn-room-en">Room {room}</div>
        <div className="gn-rule" aria-hidden />
        <h1 className="gn-title">{ko.roomChatSubtitle}</h1>
        <p className="gn-title-lead">{ko.helpIntro}</p>
      </header>

      {/* ② Hero */}
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
            // SVG from local qrcode — trusted string we generated
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
          <div className="gn-url">{guestUrl}</div>
          <p className="gn-cta">{ko.helpTopics}</p>
        </div>

        <div className="gn-hero-side gn-hero-right">
          <div className="gn-hero-icon" aria-hidden>
            💬
          </div>
          <p className="gn-hero-ko">{ko.scanSupport}</p>
          <p className="gn-hero-en">{en.scanSupport}</p>
        </div>
      </section>

      {/* ③ Language cards */}
      <section className="gn-langs" aria-label="Languages">
        {NOTICE_CARD_LANGS.map((lang) => {
          const c = guestChatNoticeCopy[lang];
          return (
            <article className="gn-lang-card" key={lang}>
              <div className="gn-lang-head">
                <span className="gn-lang-flag" aria-hidden>
                  {LANG_FLAG[lang]}
                </span>
                <span className="gn-lang-name">{langDisplayName(lang)}</span>
              </div>
              <p className="gn-lang-intro">{c.helpIntro}</p>
              <p className="gn-lang-topics-text">{c.helpTopics}</p>
              <div className="gn-lang-divider" aria-hidden />
              <ul className="gn-lang-topics" aria-hidden>
                {TOPIC_ICONS.map((t) => (
                  <li key={`${lang}-${t.tip}`}>
                    <span className="gn-topic-icon">{t.icon}</span>
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </section>

      {/* ④ Information boxes */}
      <section className="gn-info" aria-label="Service">
        <div className="gn-info-card">
          <div className="gn-info-icon" aria-hidden>
            🕐
          </div>
          <div className="gn-info-title">{ko.hoursTitle}</div>
          <div className="gn-info-body">{ko.hoursBody}</div>
          <div className="gn-info-en">{en.hoursBody}</div>
        </div>
        <div className="gn-info-card">
          <div className="gn-info-icon" aria-hidden>
            💬
          </div>
          <div className="gn-info-title">{ko.replyTitle}</div>
          <div className="gn-info-body">{ko.replyBody}</div>
          <div className="gn-info-en">{en.replyBody}</div>
        </div>
        <div className="gn-info-card">
          <div className="gn-info-icon" aria-hidden>
            🔒
          </div>
          <div className="gn-info-title">{ko.privacyTitle}</div>
          <div className="gn-info-body">{ko.privacyBody}</div>
          <div className="gn-info-en">{en.privacyBody}</div>
        </div>
      </section>

      {/* ⑤ Bottom + footer */}
      <section className="gn-bottom">
        <div className="gn-bottom-box gn-wifi">
          <div className="gn-bottom-head">
            <span aria-hidden>📶</span>
            <span>Wi-Fi</span>
          </div>
          <p className="gn-bottom-body">{ko.wifiNightstand}</p>
        </div>
        <div className="gn-bottom-box gn-emergency">
          <div className="gn-bottom-head gn-emergency-head">
            <span aria-hidden>📞</span>
            <span>
              {ko.emergencyLabel} ({en.emergencyLabel})
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
