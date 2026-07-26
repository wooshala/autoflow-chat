'use client';

// Local SVG QR builders for Guest Chat A4 notice print.
// Print itself is same-document window.print() in RoomGuestQrCard
// (popup windows are blocked in Tauri/WebView2).

import QRCode from 'qrcode';

export const GUEST_CHAT_NOTICE_QR_PRINT_OPTS = {
  errorCorrectionLevel: 'Q' as const,
  margin: 2,
  type: 'svg' as const,
  color: { dark: '#000000', light: '#ffffff' },
};

/** Escape special characters for WIFI: QR payload fields. */
export function escapeWifiQrField(value: string): string {
  return String(value).replace(/([\\;,:"])/g, '\\$1');
}

/** Standard WIFI: join payload (WPA/WPA2). */
export function buildWifiJoinPayload(ssid: string, password: string): string {
  return `WIFI:T:WPA;S:${escapeWifiQrField(ssid)};P:${escapeWifiQrField(password)};H:false;;`;
}

/** Local SVG QR for the selected guest URL (no external QR service). */
export async function buildGuestChatNoticeQrSvg(guestUrl: string): Promise<string> {
  return QRCode.toString(guestUrl, GUEST_CHAT_NOTICE_QR_PRINT_OPTS);
}

/** Local SVG Wi-Fi QR from SSID + password — inline, print-safe (no image race). */
export async function buildWifiNoticeQrSvg(ssid: string, password: string): Promise<string> {
  return QRCode.toString(buildWifiJoinPayload(ssid, password), GUEST_CHAT_NOTICE_QR_PRINT_OPTS);
}
