'use client';

// A4 Guest Chat notice sheet — shared SoT: guestChatNoticeConfig + guestChatNoticeCopy.

import {
  GUEST_CHAT_EMERGENCY_PHONE,
  GUEST_CHAT_HOTEL_NAME,
  GUEST_CHAT_NOTICE_QR_MM,
} from '@/lib/guest-spike/guestChatNoticeConfig';
import { guestChatNoticeCopy, guestChatNoticeLanguageLine } from '@/lib/guest-spike/guestChatNoticeCopy';
import { SUPPORTED_LANGS, langDisplayName } from '@/lib/guest-spike/languages';

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
  const qrMm = GUEST_CHAT_NOTICE_QR_MM;

  return (
    <main className="guest-notice-sheet" data-guest-notice-sheet="1">
      <div className="guest-notice-hotel">{hotel}</div>
      <div className="guest-notice-room">{room}호</div>
      <div className="guest-notice-subtitle">{ko.roomChatSubtitle}</div>

      <div className="guest-notice-lead">
        <div className="guest-notice-scan">{ko.scanLead}</div>
        <div className="guest-notice-support">{ko.scanSupport}</div>
      </div>

      <div className="guest-notice-qr-wrap">
        <div
          className="guest-notice-qr"
          style={{ width: `${qrMm}mm`, height: `${qrMm}mm` }}
          // SVG from local qrcode — trusted string we generated
          dangerouslySetInnerHTML={{ __html: qrSvg }}
        />
        <div className="guest-notice-url">{guestUrl}</div>
      </div>

      <div className="guest-notice-langs">{guestChatNoticeLanguageLine()}</div>

      <div className="guest-notice-section-title">Help</div>
      <div className="guest-notice-ml compact">
        {SUPPORTED_LANGS.map((lang) => {
          const c = guestChatNoticeCopy[lang];
          return (
            <div className="guest-notice-ml-row" key={`help-${lang}`}>
              <span className="guest-notice-ml-lang">{langDisplayName(lang)}</span>
              <span className="guest-notice-ml-text">
                {c.helpIntro} {c.helpTopics}
              </span>
            </div>
          );
        })}
      </div>

      <div className="guest-notice-section-title">Wi-Fi</div>
      <div className="guest-notice-ml compact">
        {SUPPORTED_LANGS.map((lang) => (
          <div className="guest-notice-ml-row" key={`wifi-${lang}`}>
            <span className="guest-notice-ml-lang">{langDisplayName(lang)}</span>
            <span className="guest-notice-ml-text">{guestChatNoticeCopy[lang].wifiNightstand}</span>
          </div>
        ))}
      </div>

      <div className="guest-notice-footer">
        <div>
          <h4>{ko.hoursTitle}</h4>
          <p>{ko.hoursBody}</p>
        </div>
        <div>
          <h4>{ko.replyTitle}</h4>
          <p>{ko.replyBody}</p>
        </div>
        <div>
          <h4>{ko.privacyTitle}</h4>
          <p>{ko.privacyBody}</p>
        </div>
      </div>

      <div className="guest-notice-emergency">
        {ko.emergencyLabel}&nbsp;&nbsp;{GUEST_CHAT_EMERGENCY_PHONE}
      </div>
      <div className="guest-notice-after">{ko.afterCheckout}</div>
    </main>
  );
}
