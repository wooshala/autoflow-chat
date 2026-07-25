'use client';

// Local SVG QR for Guest Chat A4 notice.
// Print itself is same-document window.print() in RoomGuestQrCard
// (popup windows are blocked in Tauri/WebView2).

import QRCode from 'qrcode';

export const GUEST_CHAT_NOTICE_QR_PRINT_OPTS = {
  errorCorrectionLevel: 'Q' as const,
  margin: 2,
  type: 'svg' as const,
  color: { dark: '#000000', light: '#ffffff' },
};

/** Local SVG QR for the selected guest URL (no external QR service). */
export async function buildGuestChatNoticeQrSvg(guestUrl: string): Promise<string> {
  return QRCode.toString(guestUrl, GUEST_CHAT_NOTICE_QR_PRINT_OPTS);
}
