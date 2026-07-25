// Guest Chat A4 notice — Digital Concierge service menu (icon + short label).
// Labels live in guestChatNoticeCopy.serviceLabels; icons stay language-agnostic here.

export const GUEST_NOTICE_SERVICE_IDS = [
  'towel',
  'water',
  'clean',
  'amenity',
  'parking',
  'delivery',
  'repair',
  'lost',
  'staff',
  'other',
  'extend',
  'taxi',
] as const;

export type GuestNoticeServiceId = (typeof GUEST_NOTICE_SERVICE_IDS)[number];

/** Print icons — keep count ≤ 12 to avoid flyer density. */
export const GUEST_NOTICE_SERVICE_ICON: Record<GuestNoticeServiceId, string> = {
  towel: '🛏️',
  water: '💧',
  clean: '🧹',
  amenity: '🪥',
  parking: '🚗',
  delivery: '🍜',
  repair: '🔧',
  lost: '📦',
  staff: '☎',
  other: '💬',
  extend: '🕒',
  taxi: '🚕',
};
