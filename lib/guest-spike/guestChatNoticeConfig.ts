// Guest Chat A4 notice — hotel/contact constants (single place to edit).
// Future SaaS: replace GUEST_CHAT_HOTEL_NAME with tenant/hotel settings; keep this as the fallback.

/** Front-desk / emergency contact printed on Guest Chat room notices. */
export const GUEST_CHAT_EMERGENCY_PHONE = '010-4657-6680';

/**
 * Hotel label on the notice header (current single-property default).
 * Override with env QR_HOTEL_NAME in the batch PDF pipeline; UI can pass hotelName later.
 */
export const GUEST_CHAT_HOTEL_NAME = '호텔 레이블';

/** Latin fallback when a PDF font cannot render Hangul (batch pipeline only). */
export const GUEST_CHAT_HOTEL_NAME_LATIN = 'Hotel Label';

/** Printed QR physical size (mm). Prefer mm over px for print fidelity. */
export const GUEST_CHAT_NOTICE_QR_MM = 40;

/** A4 page margins (mm) — within the 12–15mm band. */
export const GUEST_CHAT_NOTICE_MARGIN_MM = 14;
