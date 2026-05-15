'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Navigation from '@/components/Navigation';

export default function RoomsPage() {
  const router = useRouter();
  const [draft, setDraft] = useState('');

  function go() {
    const trimmed = draft.trim();
    if (trimmed) router.push(`/rooms/${encodeURIComponent(trimmed)}`);
  }

  return (
    <div className="flex h-dvh flex-col bg-gray-50">
      <header className="shrink-0 border-b border-gray-200 bg-white px-4 py-3">
        <div className="text-base font-bold text-gray-900">객실 타임라인</div>
        <div className="mt-0.5 text-xs text-gray-500">객실 번호로 이벤트 흐름을 확인합니다</div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6">
        <div className="w-full max-w-sm">
          <label className="mb-1.5 block text-sm font-semibold text-gray-700">
            객실 번호
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && go()}
              placeholder="예: 705"
              className="flex-1 rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
            />
            <button
              onClick={go}
              disabled={!draft.trim()}
              className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              조회
            </button>
          </div>
        </div>
      </main>

      <Navigation active="rooms" />
    </div>
  );
}
