'use client';

// A4 Guest Chat notice — reference guide art (live QR overlay) → services → Wi-Fi → emergency.
// One A4 page; Wi-Fi is bottom amenity (inline SVG QRs, print-safe).
// Hero uses the provided multilingual flyer art; QR slot is always the live Guest Chat SVG.

import {
  GUEST_CHAT_EMERGENCY_PHONE,
  GUEST_CHAT_HOTEL_NAME,
  GUEST_CHAT_NOTICE_WIFI_QR_MM,
} from '@/lib/guest-spike/guestChatNoticeConfig';
import { guestChatNoticeCopy } from '@/lib/guest-spike/guestChatNoticeCopy';
import {
  GUEST_NOTICE_PHONE_ICON,
  GUEST_NOTICE_WIFI_ICON,
} from '@/lib/guest-spike/guestChatNoticeIcons';
import {
  GUEST_NOTICE_GUIDE_REF_QR_BOX,
  GUEST_NOTICE_GUIDE_REF_SRC,
} from '@/lib/guest-spike/guestChatNoticeGuideRef';
import {
  GUEST_NOTICE_SERVICE_ICON,
  GUEST_NOTICE_SERVICE_IDS,
} from '@/lib/guest-spike/guestChatNoticeServices';
import { roomWifiFor } from '@/lib/guest-spike/roomWifiCredentials.generated';

function NoticeIcon({ svg, className }: { svg: string; className?: string }) {
  return (
    <span
      className={className}
      aria-hidden
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

export type GuestChatNoticeSheetProps = {
  roomNo: string;
  guestUrl: string;
  qrSvg: string;
  wifiQrSvg5g?: string | null;
  wifiQrSvg24?: string | null;
  hotelName?: string;
  /** Optional override for print HTML / preview (data URI). Defaults to public path. */
  guideRefSrc?: string;
};

export function GuestChatNoticeSheet({
  roomNo,
  guestUrl,
  qrSvg,
  wifiQrSvg5g,
  wifiQrSvg24,
  hotelName,
  guideRefSrc,
}: GuestChatNoticeSheetProps) {
  const hotel = hotelName?.trim() || GUEST_CHAT_HOTEL_NAME;
  const room = String(roomNo).replace(/[^\d]/g, '') || roomNo;
  const ko = guestChatNoticeCopy.ko;
  const en = guestChatNoticeCopy.en;
  const wifiMm = GUEST_CHAT_NOTICE_WIFI_QR_MM;
  const wifi = roomWifiFor(room);
  const refSrc = guideRefSrc || GUEST_NOTICE_GUIDE_REF_SRC;
  const qrBox = GUEST_NOTICE_GUIDE_REF_QR_BOX;

  const wifiBand = (
    label: string,
    ssid: string,
    password: string,
    svg: string | null | undefined,
  ) => (
    <div className="gn-wifi-band-card">
      <div className="gn-wifi-band">{label}</div>
      {svg ? (
        <div
          className="gn-qr gn-qr-wifi"
          style={{ width: `${wifiMm}mm`, height: `${wifiMm}mm` }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <div
          className="gn-wifi-ph"
          style={{ width: `${wifiMm}mm`, height: `${wifiMm}mm` }}
          aria-hidden
        >
          Wi-Fi
        </div>
      )}
      <div className="gn-wifi-cred">
        <div className="gn-wifi-cred-row">
          <span className="gn-wifi-cred-k">SSID</span>
          <span className="gn-wifi-cred-v gn-wifi-ssid">{ssid}</span>
        </div>
        <div className="gn-wifi-cred-row">
          <span className="gn-wifi-cred-k">{ko.wifiPasswordLabel}</span>
          <span className="gn-wifi-cred-v gn-wifi-cred-pw">{password}</span>
        </div>
      </div>
    </div>
  );

  return (
    <main className="guest-notice-sheet" data-guest-notice-sheet="1" data-layout="chat-services-wifi">
      <header className="gn-header gn-header-compact">
        <div className="gn-hotel">{hotel}</div>
        <div className="gn-rule" aria-hidden />
        <div className="gn-room">{room}호</div>
        <div className="gn-room-en">Room {room}</div>
      </header>

      {/* ① Reference guide art — live QR overlays decorative QR slot */}
      <div className="gn-concierge gn-concierge-ref" data-guest-url={guestUrl}>
        <section className="gn-guide-ref" aria-label="Guest Chat QR">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="gn-guide-ref-img"
            src={refSrc}
            alt="Guest Chat — scan QR, message staff, get help"
          />
          <div
            className="gn-guide-ref-qr gn-qr gn-qr-chat"
            style={{
              left: `${qrBox.leftPct}%`,
              top: `${qrBox.topPct}%`,
              width: `${qrBox.widthPct}%`,
            }}
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
        </section>
      </div>

      {/* ② Services + multilingual badge */}
      <section className="gn-services" aria-label="Services">
        <h2 className="gn-services-title">{ko.servicesTitle}</h2>
        <ul className="gn-service-grid">
          {GUEST_NOTICE_SERVICE_IDS.map((id) => (
            <li className="gn-service-item" key={id}>
              <NoticeIcon svg={GUEST_NOTICE_SERVICE_ICON[id]} className="gn-service-icon" />
              <span className="gn-service-label">{ko.serviceLabels[id]}</span>
              <span className="gn-service-label-en">{en.serviceLabels[id]}</span>
            </li>
          ))}
        </ul>
        <div className="gn-translate">
          <span className="gn-translate-badge">{ko.translateBadge}</span>
          <span className="gn-translate-en">{en.translateBadge}</span>
        </div>
      </section>

      {/* ③ Room Wi-Fi — bottom amenity */}
      <section className="gn-wifi-aux" aria-label="Room Wi-Fi">
        {wifi ? (
          <div className="gn-wifi-aux-qrs">
            {wifiBand(ko.wifi5gLabel, wifi.ssid5g, wifi.password, wifiQrSvg5g)}
            <div className="gn-wifi-aux-mid">
              <div className="gn-wifi-aux-title-row">
                <NoticeIcon svg={GUEST_NOTICE_WIFI_ICON} className="gn-wifi-icon" />
                <span className="gn-wifi-aux-title">{ko.wifiPanelTitle}</span>
              </div>
              <span className="gn-wifi-aux-hint">{ko.wifiScanHint}</span>
            </div>
            {wifiBand(ko.wifi24Label, wifi.ssid24, wifi.password, wifiQrSvg24)}
          </div>
        ) : (
          <>
            <div className="gn-wifi-aux-head">
              <div className="gn-wifi-aux-title-row">
                <NoticeIcon svg={GUEST_NOTICE_WIFI_ICON} className="gn-wifi-icon" />
                <span className="gn-wifi-aux-title">{ko.wifiPanelTitle}</span>
              </div>
              <span className="gn-wifi-aux-hint">{ko.wifiScanHint}</span>
            </div>
            <p className="gn-wifi-missing">{ko.wifiNightstand}</p>
          </>
        )}
      </section>

      {/* ④ Emergency */}
      <section className="gn-bottom gn-bottom-single">
        <div className="gn-bottom-box gn-emergency">
          <div className="gn-bottom-head gn-emergency-head">
            <NoticeIcon svg={GUEST_NOTICE_PHONE_ICON} className="gn-phone-icon" />
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
