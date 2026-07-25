'use client';

/**
 * Dev harness — RoomGuestQrCard + panel width probes (no staff login).
 * Route: /dev/room-guest-qr
 */

import { useMemo, useState } from 'react';

import { RoomGuestQrCard } from '@/components/chat/customer-info/RoomGuestQrCard';
import { guestRoomChannelKey } from '@/lib/guest-spike/guestRoomUrl';

const WIDTHS = [
  { id: 'min', label: '최소폭 280px', px: 280 },
  { id: 'def', label: '기본폭 320px', px: 320 },
  { id: 'max', label: '최대폭 420px', px: 420 },
] as const;

export default function RoomGuestQrDevPage() {
  const [roomNo, setRoomNo] = useState('201');
  const [widthId, setWidthId] = useState<(typeof WIDTHS)[number]['id']>('def');
  const channelKey = useMemo(() => guestRoomChannelKey(roomNo), [roomNo]);
  const width = WIDTHS.find((w) => w.id === widthId) ?? WIDTHS[1];

  return (
    <main className="min-h-screen bg-gray-100 p-6">
      <h1 className="mb-4 text-lg font-bold text-gray-900">Room Guest QR — 개발 검증</h1>
      <div className="mb-4 flex flex-wrap gap-2">
        {['201', '305'].map((r) => (
          <button
            key={r}
            type="button"
            data-testid={`room-${r}`}
            onClick={() => setRoomNo(r)}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
              roomNo === r ? 'bg-blue-600 text-white' : 'bg-white text-gray-800 border border-gray-300'
            }`}
          >
            {r}호
          </button>
        ))}
        {WIDTHS.map((w) => (
          <button
            key={w.id}
            type="button"
            data-testid={`width-${w.id}`}
            onClick={() => setWidthId(w.id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
              widthId === w.id ? 'bg-emerald-600 text-white' : 'bg-white text-gray-800 border border-gray-300'
            }`}
          >
            {w.label}
          </button>
        ))}
      </div>
      <div
        data-testid="customer-panel"
        className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
        style={{ width: width.px, maxWidth: '100%' }}
      >
        <h2 className="mb-3 text-base font-bold text-gray-900">고객 정보 / {roomNo}호</h2>
        <RoomGuestQrCard key={channelKey} channelKey={channelKey} roomNo={roomNo} />
        <div className="mt-4 space-y-2 border-t border-gray-100 pt-3">
          <p className="text-xs text-gray-500">세션 / 고객 정보 입력 (자리 확인용)</p>
          <input
            className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm"
            placeholder="고객명"
            defaultValue=""
          />
          <button type="button" className="w-full rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white">
            저장
          </button>
        </div>
      </div>
    </main>
  );
}
