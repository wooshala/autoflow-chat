'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchEnvelope } from '@/lib/api/envelope';
import { STAFF_ENTRY_INVITE_URL, STAFF_INVITES_URL } from '@/lib/chatApi';

function qrUrl(link: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(link)}`;
}

/**
 * Always-visible staff invite QR — pinned to the /chat top bar next to the
 * desktop-update box. Staff scan it with a phone to join instantly, so they
 * never need to open the participant-management panel. Rotate / copy controls
 * stay small inside the card; on mobile it wraps below the update box.
 */
export default function StaffInviteQrCard() {
  const [entryUrl, setEntryUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rotatingEntry, setRotatingEntry] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    const res = await fetchEnvelope<{ url: string }>(STAFF_ENTRY_INVITE_URL);
    if (res.ok && res.data?.url) setEntryUrl(res.data.url);
    else setLoadError('QR을 불러오지 못했습니다.');
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleRotateEntry = useCallback(async () => {
    if (!window.confirm('새 QR을 만들면 이전 QR은 사용할 수 없게 됩니다. 계속할까요?')) return;
    setRotatingEntry(true);
    try {
      const res = await fetch(STAFF_INVITES_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'rotate_entry' })
      });
      const json = await res.json();
      if (json?.ok && json?.data?.url) setEntryUrl(json.data.url);
    } finally {
      setRotatingEntry(false);
    }
  }, []);

  const copyLink = useCallback(async () => {
    if (!entryUrl) return;
    try {
      await navigator.clipboard.writeText(entryUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }, [entryUrl]);

  return (
    <div className="flex w-[260px] max-w-full items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5">
      {entryUrl ? (
        <img
          src={qrUrl(entryUrl)}
          alt="직원 입장 QR"
          className="h-[112px] w-[112px] shrink-0 rounded-md border border-emerald-200 bg-white p-1"
        />
      ) : (
        <div className="flex h-[112px] w-[112px] shrink-0 items-center justify-center rounded-md border border-emerald-200 bg-white text-[11px] text-gray-400">
          QR 로딩…
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold text-emerald-900">직원 초대</div>
        <p className="mt-0.5 text-[11px] text-emerald-700">QR 스캔 → 즉시 입장</p>
        {loadError ? (
          <p className="mt-1 text-[11px] text-rose-600" role="alert">
            {loadError}
            <button type="button" onClick={() => void load()} className="ml-1 underline">
              다시
            </button>
          </p>
        ) : null}
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button
            type="button"
            disabled={rotatingEntry}
            onClick={() => void handleRotateEntry()}
            className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
          >
            {rotatingEntry ? '재발급 중…' : 'QR 재발급'}
          </button>
          <button
            type="button"
            disabled={!entryUrl}
            onClick={() => void copyLink()}
            className="rounded-md border border-gray-300 bg-white px-2 py-1 text-[11px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {copied ? '복사됨 ✓' : '링크 복사'}
          </button>
        </div>
      </div>
    </div>
  );
}
