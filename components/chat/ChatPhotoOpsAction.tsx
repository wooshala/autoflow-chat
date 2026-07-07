'use client';

import type { ChatMessage } from '@/lib/types';
import type { LostFoundMessageLink } from '@/lib/ops-events/lostFoundUi';

export type PhotoOpsRegistration = 'lost_found' | 'maintenance' | null;

export function getPhotoOpsRegistration(
  msg: ChatMessage,
  lostFoundLink?: LostFoundMessageLink | null
): PhotoOpsRegistration {
  if (lostFoundLink) return 'lost_found';
  if (
    msg.ticket_id &&
    (msg.ai_action === 'ticket_created_manual' ||
      msg.ai_action === 'ticket_created' ||
      msg.ai_action === 'ticket_linked_existing')
  ) {
    return 'maintenance';
  }
  return null;
}

type Props = {
  msg: ChatMessage;
  lostFoundLink?: LostFoundMessageLink | null;
  lostFoundEnabled?: boolean;
  /** Register new or open existing — never navigates to /ops */
  onLostFoundPhotoClick?: (msg: ChatMessage) => void;
  onRegisterMaintenance?: (msg: ChatMessage) => void;
  onOther?: () => void;
};

/**
 * LF-3B/LF-4A — photo ops strip; all lost-found actions stay on /chat.
 */
export default function ChatPhotoOpsAction({
  msg,
  lostFoundLink,
  lostFoundEnabled = false,
  onLostFoundPhotoClick,
  onRegisterMaintenance,
  onOther
}: Props) {
  if (!msg.image_url) return null;

  const registration = getPhotoOpsRegistration(msg, lostFoundLink);
  const canLostFound = lostFoundEnabled && typeof onLostFoundPhotoClick === 'function';

  if (registration === 'lost_found' && lostFoundLink) {
    return (
      <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-950">
        <button
          type="button"
          disabled={!canLostFound}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onLostFoundPhotoClick?.(msg);
          }}
          className="w-full text-left disabled:opacity-60"
        >
          <div className="font-bold">🧳 분실물 등록됨</div>
          <div className="mt-0.5 font-semibold text-amber-800">{lostFoundLink.event_no}</div>
        </button>
      </div>
    );
  }

  if (registration === 'maintenance') {
    return (
      <div className="mt-2 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-2 text-xs text-sky-950">
        <div className="font-bold">🔧 시설고장 등록됨</div>
      </div>
    );
  }

  const showLostFound = canLostFound;
  const showMaintenance = typeof onRegisterMaintenance === 'function';

  if (!showLostFound && !showMaintenance && !onOther) return null;

  return (
    <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50/90 px-2.5 py-2">
      <div className="mb-1.5 text-[11px] font-semibold text-gray-600">이 사진은?</div>
      <div className="flex flex-wrap gap-1.5">
        {showLostFound ? (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onLostFoundPhotoClick!(msg);
            }}
            className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-semibold text-gray-800 hover:bg-gray-50"
          >
            🧳 분실물
          </button>
        ) : null}
        {showMaintenance ? (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onRegisterMaintenance!(msg);
            }}
            className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-semibold text-gray-800 hover:bg-gray-50"
          >
            🔧 시설고장
          </button>
        ) : null}
        {onOther ? (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onOther();
            }}
            className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-semibold text-gray-800 hover:bg-gray-50"
          >
            📌 기타
          </button>
        ) : null}
      </div>
    </div>
  );
}
