'use client';

// Always-visible Guest QR for the selected customer room (staff right panel).
// URL SoT: lib/guest-spike/guestRoomUrl.ts
// Print: same-document window.print() — no popup windows (Tauri/WebView2 blocks them).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import QRCode from 'qrcode';

import { GuestChatNoticeSheet } from '@/components/chat/customer-info/GuestChatNoticeSheet';
import '@/components/chat/customer-info/guestChatNoticePrint.css';
import { guestChannelUrl, resolveGuestChannelKey } from '@/lib/guest-spike/guestRoomUrl';
import { GUEST_CHAT_HOTEL_NAME } from '@/lib/guest-spike/guestChatNoticeConfig';
import { buildGuestChatNoticeQrSvg, buildWifiNoticeQrSvg } from '@/lib/guest-spike/buildGuestChatNoticeQrSvg';
import { roomWifiFor } from '@/lib/guest-spike/roomWifiCredentials.generated';

/** Display size in the panel (CSS). */
const QR_DISPLAY_PX = 160;
/** Generate at 2× display size so CSS downscale stays sharp. */
const QR_GEN_PX = 320;
const QR_OPTS = {
  errorCorrectionLevel: 'Q' as const,
  margin: 2,
  width: QR_GEN_PX,
  color: { dark: '#000000', light: '#ffffff' },
};

const PRINT_BODY_CLASS = 'printing-guest-notice';

type PrintNoticeData = {
  roomNo: string;
  guestUrl: string;
  qrSvg: string;
  wifiQrSvg5g: string | null;
  wifiQrSvg24: string | null;
};

export function RoomGuestQrCard({
  channelKey,
  roomNo,
}: {
  channelKey: string;
  /** Display label digits (e.g. "201"). Falls back to digits parsed from channelKey. */
  roomNo?: string | null;
}) {
  const resolvedKey = useMemo(
    () => resolveGuestChannelKey(channelKey) ?? resolveGuestChannelKey(roomNo),
    [channelKey, roomNo],
  );

  const roomLabel = useMemo(() => {
    if (roomNo && String(roomNo).trim()) return String(roomNo).replace(/[^\d]/g, '') || String(roomNo);
    const m = resolvedKey ? /^room-(\d+)/.exec(resolvedKey) : null;
    return m?.[1] ?? channelKey;
  }, [channelKey, roomNo, resolvedKey]);

  const url = useMemo(() => {
    if (!resolvedKey) return null;
    try {
      return guestChannelUrl(resolvedKey);
    } catch {
      return null;
    }
  }, [resolvedKey]);

  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrError, setQrError] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'ok' | 'fail'>('idle');
  const [printNotice, setPrintNotice] = useState<PrintNoticeData | null>(null);
  const [printBusy, setPrintBusy] = useState(false);
  const [printFail, setPrintFail] = useState(false);
  const [portalReady, setPortalReady] = useState(false);
  const cleanedRef = useRef(false);
  const printBusyRef = useRef(false);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setQrDataUrl(null);
    setQrError(false);

    if (!url) {
      setQrError(true);
      return () => {
        cancelled = true;
      };
    }

    QRCode.toDataURL(url, QR_OPTS)
      .then((dataUrl) => {
        if (!cancelled) setQrDataUrl(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setQrError(true);
      });

    return () => {
      cancelled = true;
    };
  }, [url]);

  const endPrintSession = useCallback(() => {
    if (cleanedRef.current) return;
    cleanedRef.current = true;
    printBusyRef.current = false;
    document.body.classList.remove(PRINT_BODY_CLASS);
    setPrintNotice(null);
    setPrintBusy(false);
  }, []);

  // Same-document print: render notice → layout paint → window.print() → afterprint cleanup.
  useEffect(() => {
    if (!printNotice) return;

    cleanedRef.current = false;
    document.body.classList.add(PRINT_BODY_CLASS);

    const onAfterPrint = () => {
      endPrintSession();
    };
    window.addEventListener('afterprint', onAfterPrint);

    let raf1 = 0;
    let raf2 = 0;
    let stuckTimer = 0;

    raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => {
        try {
          window.print();
        } catch {
          endPrintSession();
          setPrintFail(true);
          window.setTimeout(() => setPrintFail(false), 2500);
          return;
        }
        // Chromium/WebView2: print() returns after the dialog closes.
        // afterprint covers environments where print() returns earlier.
        endPrintSession();
        // Safety only — print root is display:none on screen (no permanent overlay).
        stuckTimer = window.setTimeout(() => {
          endPrintSession();
        }, 60_000);
      });
    });

    return () => {
      window.cancelAnimationFrame(raf1);
      window.cancelAnimationFrame(raf2);
      if (stuckTimer) window.clearTimeout(stuckTimer);
      window.removeEventListener('afterprint', onAfterPrint);
      document.body.classList.remove(PRINT_BODY_CLASS);
    };
  }, [printNotice, endPrintSession]);

  const onCopy = useCallback(async () => {
    if (!url) {
      setCopyState('fail');
      window.setTimeout(() => setCopyState('idle'), 2000);
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopyState('ok');
      window.setTimeout(() => setCopyState('idle'), 2000);
    } catch {
      setCopyState('fail');
      window.setTimeout(() => setCopyState('idle'), 2000);
    }
  }, [url]);

  const onPrint = useCallback(async () => {
    if (!url || printBusyRef.current) return;
    printBusyRef.current = true;
    setPrintBusy(true);
    setPrintFail(false);
    try {
      const wifi = roomWifiFor(roomLabel);
      const [qrSvg, wifiQrSvg5g, wifiQrSvg24] = await Promise.all([
        buildGuestChatNoticeQrSvg(url),
        wifi ? buildWifiNoticeQrSvg(wifi.ssid5g, wifi.password) : Promise.resolve(null),
        wifi ? buildWifiNoticeQrSvg(wifi.ssid24, wifi.password) : Promise.resolve(null),
      ]);
      setPrintNotice({
        roomNo: roomLabel,
        guestUrl: url,
        qrSvg,
        wifiQrSvg5g,
        wifiQrSvg24,
      });
    } catch {
      printBusyRef.current = false;
      setPrintBusy(false);
      setPrintFail(true);
      window.setTimeout(() => setPrintFail(false), 2500);
    }
  }, [url, roomLabel]);

  const printPortal =
    portalReady && printNotice
      ? createPortal(
          <div className="guest-notice-print-root" data-guest-notice-print="1" aria-hidden>
            <GuestChatNoticeSheet
              roomNo={printNotice.roomNo}
              guestUrl={printNotice.guestUrl}
              qrSvg={printNotice.qrSvg}
              wifiQrSvg5g={printNotice.wifiQrSvg5g}
              wifiQrSvg24={printNotice.wifiQrSvg24}
              hotelName={GUEST_CHAT_HOTEL_NAME}
            />
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      {printPortal}
      <section className="rounded-xl border border-gray-200 bg-white p-3" aria-label={`${roomLabel}호 Guest QR`}>
        <h3 className="mb-2 text-xs font-bold text-gray-700">객실 QR 코드</h3>
        <div className="flex flex-col items-center gap-2">
          <div
            className="flex h-[160px] w-[160px] max-w-full items-center justify-center rounded-md border border-gray-100 bg-white p-1"
            style={{ width: QR_DISPLAY_PX, height: QR_DISPLAY_PX }}
          >
            {qrError || !url ? (
              <p className="px-2 text-center text-[11px] font-medium text-red-600">QR을 만들지 못했습니다.</p>
            ) : qrDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- data: URL from local qrcode
              <img
                src={qrDataUrl}
                alt={`${roomLabel}호 Guest QR`}
                width={QR_DISPLAY_PX}
                height={QR_DISPLAY_PX}
                className="h-full w-full object-contain"
                decoding="async"
              />
            ) : (
              <div className="h-8 w-8 animate-pulse rounded bg-gray-200" aria-hidden />
            )}
          </div>
          {url ? (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              title={url}
              className="max-w-full truncate text-center text-[11px] font-medium text-blue-600 hover:underline"
            >
              {url}
            </a>
          ) : (
            <p className="text-center text-[11px] text-gray-500">유효하지 않은 객실 링크</p>
          )}
          <div className="flex w-full gap-2">
            <button
              type="button"
              onClick={() => void onCopy()}
              disabled={!url}
              className="flex-1 rounded-lg border border-gray-300 bg-gray-50 px-3 py-1.5 text-sm font-semibold text-gray-800 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              링크 복사
            </button>
            <button
              type="button"
              onClick={() => void onPrint()}
              disabled={!url || printBusy}
              className="flex-1 rounded-lg border border-blue-300 bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-900 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {printBusy ? '출력 준비 중...' : 'QR 출력'}
            </button>
          </div>
          {copyState === 'ok' && (
            <p className="text-center text-[11px] font-medium text-green-600" role="status">
              링크가 복사되었습니다.
            </p>
          )}
          {copyState === 'fail' && (
            <p className="text-center text-[11px] font-medium text-red-600" role="status">
              복사에 실패했습니다.
            </p>
          )}
          {printFail && (
            <p className="text-center text-[11px] font-medium text-red-600" role="status">
              인쇄를 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.
            </p>
          )}
        </div>
      </section>
    </>
  );
}
