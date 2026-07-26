'use client';

// A4 Guest Chat notice — chat guide hero (QR + 1→2→3) → services → trust → Wi-Fi → emergency.
// One A4 page; Wi-Fi is bottom amenity (inline SVG QRs, print-safe).
// Hero follows reference flyer layout; QR is always the live Guest Chat SVG (never decorative).

import {
  GUEST_CHAT_EMERGENCY_PHONE,
  GUEST_CHAT_HOTEL_NAME,
  GUEST_CHAT_NOTICE_QR_MM,
  GUEST_CHAT_NOTICE_WIFI_QR_MM,
} from '@/lib/guest-spike/guestChatNoticeConfig';
import { guestChatNoticeCopy } from '@/lib/guest-spike/guestChatNoticeCopy';
import {
  GUEST_NOTICE_PHONE_ICON,
  GUEST_NOTICE_TRUST_ICON,
  GUEST_NOTICE_WIFI_ICON,
} from '@/lib/guest-spike/guestChatNoticeIcons';
import {
  GUEST_NOTICE_SCAN_BAR_ICON,
  GUEST_NOTICE_STEP_CHAT_ART,
  GUEST_NOTICE_STEP_SCAN_ART,
  GUEST_NOTICE_STEP_STAFF_ART,
} from '@/lib/guest-spike/guestChatNoticeGuide';
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
};

export function GuestChatNoticeSheet({
  roomNo,
  guestUrl,
  qrSvg,
  wifiQrSvg5g,
  wifiQrSvg24,
  hotelName,
}: GuestChatNoticeSheetProps) {
  const hotel = hotelName?.trim() || GUEST_CHAT_HOTEL_NAME;
  const room = String(roomNo).replace(/[^\d]/g, '') || roomNo;
  const ko = guestChatNoticeCopy.ko;
  const en = guestChatNoticeCopy.en;
  const chatMm = GUEST_CHAT_NOTICE_QR_MM;
  const wifiMm = GUEST_CHAT_NOTICE_WIFI_QR_MM;
  const wifi = roomWifiFor(room);

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

      {/* ① Guest Chat guide — live QR + 1→2→3 steps */}
      <div className="gn-concierge" data-guest-url={guestUrl}>
        <section className="gn-guide" aria-label="Guest Chat QR">
          <div className="gn-guide-qr">
            <div className="gn-chat-hero-label">{ko.chatQrCaption}</div>
            <div
              className="gn-qr gn-qr-chat"
              style={{ width: `${chatMm}mm`, height: `${chatMm}mm` }}
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
            <div className="gn-scan-bar">
              <NoticeIcon svg={GUEST_NOTICE_SCAN_BAR_ICON} className="gn-scan-bar-icon" />
              <div className="gn-scan-bar-text">
                <span className="gn-scan-bar-ko">{ko.scanBar}</span>
                <span className="gn-scan-bar-en">{en.scanBar}</span>
              </div>
            </div>
          </div>

          <div className="gn-guide-steps" aria-label="How Guest Chat works">
            <div className="gn-step">
              <div className="gn-step-num" aria-hidden>
                1
              </div>
              <NoticeIcon svg={GUEST_NOTICE_STEP_SCAN_ART} className="gn-step-art" />
              <p className="gn-step-ko">{ko.step1Body}</p>
              <p className="gn-step-en">{en.step1Body}</p>
            </div>
            <div className="gn-step-arrow" aria-hidden>
              ›
            </div>
            <div className="gn-step">
              <div className="gn-step-num" aria-hidden>
                2
              </div>
              <NoticeIcon svg={GUEST_NOTICE_STEP_CHAT_ART} className="gn-step-art gn-step-art-chat" />
              <p className="gn-step-sample">
                <span className="gn-step-sample-g">{ko.demoGuest}</span>
                <span className="gn-step-sample-s">{ko.demoStaff}</span>
              </p>
              <p className="gn-step-ko">{ko.step2Body}</p>
              <p className="gn-step-en">{en.step2Body}</p>
            </div>
            <div className="gn-step-arrow" aria-hidden>
              ›
            </div>
            <div className="gn-step">
              <div className="gn-step-num" aria-hidden>
                3
              </div>
              <NoticeIcon svg={GUEST_NOTICE_STEP_STAFF_ART} className="gn-step-art" />
              <p className="gn-step-ko">{ko.step3Body}</p>
              <p className="gn-step-en">{en.step3Body}</p>
            </div>
          </div>
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

      {/* ③ Trust */}
      <section className="gn-trust" aria-label="Trust">
        <div className="gn-trust-chip">
          <NoticeIcon svg={GUEST_NOTICE_TRUST_ICON.hours} className="gn-trust-icon" />
          <div>
            <div className="gn-trust-ko">{ko.hoursBody}</div>
            <div className="gn-trust-en">{en.hoursBody}</div>
          </div>
        </div>
        <div className="gn-trust-chip">
          <NoticeIcon svg={GUEST_NOTICE_TRUST_ICON.reply} className="gn-trust-icon" />
          <div>
            <div className="gn-trust-ko">{ko.replyBody}</div>
            <div className="gn-trust-en">{en.replyBody}</div>
          </div>
        </div>
        <div className="gn-trust-chip">
          <NoticeIcon svg={GUEST_NOTICE_TRUST_ICON.watch} className="gn-trust-icon" />
          <div>
            <div className="gn-trust-ko">{ko.staffWatchBody}</div>
            <div className="gn-trust-en">{en.staffWatchBody}</div>
          </div>
        </div>
        <div className="gn-trust-chip">
          <NoticeIcon svg={GUEST_NOTICE_TRUST_ICON.privacy} className="gn-trust-icon" />
          <div>
            <div className="gn-trust-ko">{ko.privacyBody}</div>
            <div className="gn-trust-en">{en.privacyBody}</div>
          </div>
        </div>
      </section>

      {/* ④ Room Wi-Fi — bottom amenity */}
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

      {/* ⑤ Emergency */}
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
