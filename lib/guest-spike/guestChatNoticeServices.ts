// Guest Chat A4 notice — Digital Concierge service menu (icon + short label).
// Labels live in guestChatNoticeCopy.serviceLabels; icons are shared stroke SVGs.

import { GUEST_NOTICE_SERVICE_ICON_SVG } from './guestChatNoticeIcons';

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

/** Print/UI icons — identical stroke SVG set (no emoji). */
export const GUEST_NOTICE_SERVICE_ICON: Record<GuestNoticeServiceId, string> =
  GUEST_NOTICE_SERVICE_ICON_SVG;
