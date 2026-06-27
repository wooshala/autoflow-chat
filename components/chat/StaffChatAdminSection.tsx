'use client';

import QuickPhraseAdminPanel from '@/components/chat/QuickPhraseAdminPanel';

type Props = {
  /** Collapsed by default; parent toggles visibility. */
  open: boolean;
};

/**
 * Staff invite + quick phrase admin UI.
 * Kept separate from /chat page for a future /chat/admin route.
 */
export default function StaffChatAdminSection({ open }: Props) {
  if (!open) return null;

  return (
    <section
      aria-label="직원 및 문구 관리"
      className="shrink-0 max-h-[min(40vh,320px)] overflow-y-auto border-t border-gray-700 bg-gray-800 px-3 py-3"
    >
      <QuickPhraseAdminPanel />
    </section>
  );
}
