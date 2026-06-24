'use client';

import RoomSelectorBar from '@/components/staff-chat/RoomSelectorBar';
import QuickPhraseBar, { type QuickPhraseInsertPayload } from '@/components/staff-chat/QuickPhraseBar';
import type { StaffLocale } from '@/lib/i18n/messages';

type Props = {
  previewUrl: string;
  photoRoom: string;
  selectedStatusText: string;
  locale: StaffLocale;
  roomLabel: string;
  statusLabel: string;
  cancelLabel: string;
  sendLabel: string;
  sending: boolean;
  onRoomSelect: (roomNo: string) => void;
  onStatusSelect: (payload: QuickPhraseInsertPayload) => void;
  onCancel: () => void;
  onSend: () => void;
};

export default function PhotoConfirmPanel({
  previewUrl,
  photoRoom,
  selectedStatusText,
  locale,
  roomLabel,
  statusLabel,
  cancelLabel,
  sendLabel,
  sending,
  onRoomSelect,
  onStatusSelect,
  onCancel,
  onSend
}: Props) {
  return (
    <div className="border-t border-orange-200 bg-orange-50/80 px-2 py-2">
      <div className="mx-auto max-w-md space-y-2">
        <img
          src={previewUrl}
          alt=""
          className="max-h-32 w-full rounded-xl border border-orange-200 object-contain bg-white sm:max-h-40"
        />
        {selectedStatusText ? (
          <p className="rounded-lg bg-white px-3 py-2 text-center text-base font-semibold text-gray-800">
            {photoRoom ? `${photoRoom}${locale === 'ko' ? '호 ' : ' '}` : ''}
            {selectedStatusText}
          </p>
        ) : null}
        <RoomSelectorBar
          selectedRoom={photoRoom}
          onSelect={onRoomSelect}
          disabled={sending}
          sectionLabel={roomLabel}
          large
          compactMobile
        />
        <QuickPhraseBar
          locale={locale}
          sectionLabel={statusLabel}
          onInsert={onStatusSelect}
          disabled={sending}
          large
          compactMobile
          selectedLabel={selectedStatusText}
        />
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            disabled={sending}
            className="h-12 flex-1 rounded-xl border-2 border-gray-300 bg-white text-base font-bold text-gray-700 active:bg-gray-100 disabled:opacity-40"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onSend}
            disabled={sending}
            className="h-12 flex-[1.4] rounded-xl bg-blue-600 text-base font-extrabold text-white active:bg-blue-700 disabled:opacity-40"
          >
            {sending ? '…' : sendLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
