'use client';

// Always-visible Guest QR for the selected customer room (staff right panel).
// URL SoT: lib/guest-spike/guestRoomUrl.ts (same rule as door-label print pipeline).
// Image: generated in-browser via `qrcode` (no third-party QR HTTP service).

import { useCallback, useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';

import { guestChannelUrl, resolveGuestChannelKey } from '@/lib/guest-spike/guestRoomUrl';
import { openGuestChatNoticePrint } from '@/lib/guest-spike/openGuestChatNoticePrint';

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
  const [printState, setPrintState] = useState<'idle' | 'ok' | 'fail'>('idle');

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
    if (!url) {
      setPrintState('fail');
      window.setTimeout(() => setPrintState('idle'), 2500);
      return;
    }
    const result = await openGuestChatNoticePrint({ roomNo: roomLabel, guestUrl: url });
    if (result === 'ok') {
      setPrintState('ok');
      window.setTimeout(() => setPrintState('idle'), 2000);
    } else {
      setPrintState('fail');
      window.setTimeout(() => setPrintState('idle'), 2500);
    }
  }, [url, roomLabel]);

  return (
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
            disabled={!url}
            className="flex-1 rounded-lg border border-blue-300 bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-900 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            QR 출력
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
        {printState === 'ok' && (
          <p className="text-center text-[11px] font-medium text-green-600" role="status">
            인쇄 창을 열었습니다.
          </p>
        )}
        {printState === 'fail' && (
          <p className="text-center text-[11px] font-medium text-red-600" role="status">
            인쇄 창을 열 수 없습니다. 브라우저의 팝업 허용 설정을 확인해 주세요.
          </p>
        )}
      </div>
    </section>
  );
}
