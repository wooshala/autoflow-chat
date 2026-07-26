'use client';

// A4 Guest Chat notice — chat hero → services → multilingual how-to → trust → Wi-Fi → emergency.
// One A4 page; Wi-Fi is bottom amenity (inline SVG QRs, print-safe).

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
  GUEST_NOTICE_DEMO_CHECK_ICON,
  GUEST_NOTICE_DEMO_WATER_ICON,
} from '@/lib/guest-spike/guestChatNoticeDemo';
import {
  GUEST_NOTICE_SERVICE_ICON,
  GUEST_NOTICE_SERVICE_IDS,
} from '@/lib/guest-spike/guestChatNoticeServices';
import { roomWifiFor } from '@/lib/guest-spike/roomWifiCredentials.generated';
import { langDisplayName } from '@/lib/guest-spike/languages';

const NOTICE_STRIP_LANGS = ['ko', 'en', 'zh-CN', 'ja'] as const;

const LANG_FLAG: Record<(typeof NOTICE_STRIP_LANGS)[number], string> = {
  ko: '🇰🇷',
  en: '🇺🇸',
  'zh-CN': '🇨🇳',
  ja: '🇯🇵',
};

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

      {/* ① Guest Chat hero — QR (primary) + phone chat demo (secondary) */}
      <div className="gn-concierge" data-guest-url={guestUrl}>
        <section className="gn-chat-hero" aria-label="Guest Chat QR">
          <div className="gn-chat-hero-qr">
            <div className="gn-chat-hero-label">{ko.chatQrCaption}</div>
            <div
              className="gn-qr gn-qr-chat"
              style={{ width: `${chatMm}mm`, height: `${chatMm}mm` }}
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
            <p className="gn-chat-hero-hint">{ko.scanLead}</p>
            <p className="gn-chat-hero-hint-en">{en.scanLead}</p>
          </div>
          <div className="gn-chat-demo" aria-label="Chat example">
            <div className="gn-phone">
              <div className="gn-phone-notch" aria-hidden />
              <div className="gn-phone-screen">
                <div className="gn-bubble gn-bubble-guest">
                  <NoticeIcon svg={GUEST_NOTICE_DEMO_WATER_ICON} className="gn-bubble-icon" />
                  <span className="gn-bubble-text">{ko.demoGuest}</span>
                </div>
                <div className="gn-bubble-arrow" aria-hidden>
                  ↓
                </div>
                <div className="gn-bubble gn-bubble-staff">
                  <NoticeIcon svg={GUEST_NOTICE_DEMO_CHECK_ICON} className="gn-bubble-icon" />
                  <span className="gn-bubble-text">{ko.demoStaff}</span>
                </div>
              </div>
            </div>
            <p className="gn-demo-caption">{ko.demoCaption}</p>
            <p className="gn-demo-caption-en">{en.demoCaption}</p>
          </div>
        </section>
      </div>

      {/* ② Services you can request via Chat */}
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
      </section>

      {/* ③ Multilingual QR how-to */}
      <section className="gn-lang-strip" aria-label="How to use room QR">
        <h2 className="gn-howto-title">{ko.howToTitle}</h2>
        <p className="gn-howto-title-en">{en.howToTitle}</p>
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

      {/* ④ Trust */}
      <section className="gn-trust" aria-label="Trust">
        <div className="gn-trust-chip">
          <NoticeIcon svg={GUEST_NOTICE_TRUST_ICON.watch} className="gn-trust-icon" />
          <div>
            <div className="gn-trust-ko">{ko.staffWatchBody}</div>
            <div className="gn-trust-en">{en.staffWatchBody}</div>
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
          <NoticeIcon svg={GUEST_NOTICE_TRUST_ICON.hours} className="gn-trust-icon" />
          <div>
            <div className="gn-trust-ko">{ko.hoursBody}</div>
            <div className="gn-trust-en">{en.hoursBody}</div>
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

      {/* ⑤ Room Wi-Fi — bottom amenity */}
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

      {/* ⑥ Emergency */}
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
