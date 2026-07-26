// Shared stroke SVG icons for Guest Chat A4 notice (print + React).
// Same viewBox / stroke / visual weight — no emoji in service/Wi-Fi/trust marks.

const ATTR =
  'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';

function icon(paths: string): string {
  return `<svg ${ATTR}>${paths}</svg>`;
}

/** Small Wi-Fi mark for the secondary panel title. */
export const GUEST_NOTICE_WIFI_ICON = icon(
  '<path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><circle cx="12" cy="20" r="1" fill="currentColor" stroke="none"/>',
);

export const GUEST_NOTICE_TRUST_ICON = {
  watch: icon(
    '<circle cx="12" cy="12" r="9"/><path d="M12 8v4l2.5 1.5"/><path d="M12 3v1.5"/><path d="M12 19.5V21"/>',
  ),
  reply: icon('<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"/>'),
  hours: icon('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  privacy: icon(
    '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  ),
} as const;

export const GUEST_NOTICE_PHONE_ICON = icon(
  '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
);

/** Digital Concierge service grid — stroke set matching Wi-Fi / trust icons. */
export const GUEST_NOTICE_SERVICE_ICON_SVG: Record<
  | 'towel'
  | 'water'
  | 'clean'
  | 'amenity'
  | 'parking'
  | 'delivery'
  | 'repair'
  | 'lost'
  | 'staff'
  | 'other'
  | 'extend'
  | 'taxi',
  string
> = {
  towel: icon(
    '<path d="M3 7h13a3 3 0 0 1 0 6H3z"/><path d="M3 13v4a2 2 0 0 0 2 2h11"/><path d="M16 7V5a2 2 0 0 0-2-2H5"/>',
  ),
  water: icon(
    '<path d="M12 3s5 6.2 5 10a5 5 0 0 1-10 0c0-3.8 5-10 5-10z"/>',
  ),
  clean: icon(
    '<path d="M4 20h4l10-10a2.1 2.1 0 0 0-3-3L5 17v3z"/><path d="M13.5 6.5 17 3"/>',
  ),
  amenity: icon(
    '<path d="M5 20V10"/><path d="M9 20V4"/><path d="M13 20v-7"/><path d="M17 20V8"/><path d="M3 20h18"/>',
  ),
  parking: icon(
    '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 16V8h4a3 3 0 0 1 0 6H9z"/>',
  ),
  delivery: icon(
    '<path d="M3 9h13v9H3z"/><path d="M16 12h3l2 3v3h-5z"/><circle cx="7.5" cy="19.5" r="1.5"/><circle cx="17.5" cy="19.5" r="1.5"/>',
  ),
  repair: icon(
    '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-3-3 2.5-2.5z"/>',
  ),
  lost: icon(
    '<path d="M16.5 9.4 18 21H6L7.5 9.4"/><path d="M8 8a4 4 0 0 1 8 0"/><path d="M9 13h6"/>',
  ),
  staff: icon(
    '<path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4z"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  ),
  other: icon(
    '<path d="M21 12a8.5 8.5 0 0 1-11.6 7.9L4 21l1.2-4.2A8.5 8.5 0 1 1 21 12z"/>',
  ),
  extend: icon('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>'),
  taxi: icon(
    '<path d="M4 13h16l-1.5-5.2A2 2 0 0 0 16.6 6H7.4a2 2 0 0 0-1.9 1.8L4 13z"/><path d="M4 13v4h2.5"/><path d="M17.5 17H20v-4"/><circle cx="7.5" cy="17.5" r="1.5"/><circle cx="16.5" cy="17.5" r="1.5"/><path d="M9 6V4h6v2"/>',
  ),
};
