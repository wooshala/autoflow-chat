'use client';

import QRCode from 'qrcode';

import { buildGuestChatNoticeHtml } from '@/lib/guest-spike/guestChatNoticePrintHtml';
import { GUEST_CHAT_HOTEL_NAME } from '@/lib/guest-spike/guestChatNoticeConfig';

const QR_PRINT_OPTS = {
  errorCorrectionLevel: 'Q' as const,
  margin: 2,
  type: 'svg' as const,
  color: { dark: '#000000', light: '#ffffff' },
};

/**
 * Opens a dedicated A4 Guest Chat notice window (not the browser chrome of /chat),
 * then triggers the system print dialog.
 *
 * IMPORTANT: `window.open` runs synchronously at the start so popup blockers stay happy
 * when called from a user click handler.
 */
export async function openGuestChatNoticePrint(input: {
  roomNo: string;
  guestUrl: string;
  hotelName?: string;
}): Promise<'ok' | 'popup-blocked' | 'qr-failed'> {
  // Do NOT use `noopener` here — it makes window.open() return null in Chromium,
  // so we cannot write the A4 document into the popup.
  const popup = window.open('about:blank', 'guestChatNoticePrint', 'width=900,height=1200');
  if (!popup) return 'popup-blocked';

  try {
    const qrSvg = await QRCode.toString(input.guestUrl, QR_PRINT_OPTS);
    const html = buildGuestChatNoticeHtml({
      roomNo: input.roomNo,
      guestUrl: input.guestUrl,
      qrSvg,
      hotelName: input.hotelName || GUEST_CHAT_HOTEL_NAME,
    });

    popup.document.open();
    popup.document.write(html);
    popup.document.close();

    // Wait for SVG paint / fonts before print so the dialog is not empty.
    await new Promise<void>((resolve) => {
      const done = () => resolve();
      if (popup.document.readyState === 'complete') {
        window.setTimeout(done, 300);
      } else {
        popup.addEventListener('load', () => window.setTimeout(done, 300), { once: true });
        window.setTimeout(done, 800);
      }
    });

    try {
      popup.focus();
      popup.print();
    } catch {
      /* toolbar 인쇄 still available */
    }
    return 'ok';
  } catch {
    try {
      popup.close();
    } catch {
      /* ignore */
    }
    return 'qr-failed';
  }
}
