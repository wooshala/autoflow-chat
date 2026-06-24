'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchEnvelope } from '@/lib/api/envelope';
import { STAFF_INVITES_URL } from '@/lib/chatApi';
import type { StaffInvite } from '@/lib/types';

type InviteRow = StaffInvite & { url?: string };

export default function StaffInvitePanel() {
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [name, setName] = useState('');
  const [role, setRole] = useState('cleaning');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetchEnvelope<{ invites: InviteRow[] }>(STAFF_INVITES_URL);
    if (res.ok && res.data?.invites) setInvites(res.data.invites);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate() {
    const res = await fetch(STAFF_INVITES_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ display_name: name, role })
    });
    if (res.ok) {
      setName('');
      void load();
    }
  }

  async function toggleEnabled(id: string, enabled: boolean) {
    await fetch(STAFF_INVITES_URL, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, enabled })
    });
    void load();
  }

  function qrUrl(link: string) {
    return `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(link)}`;
  }

  return (
    <div className="rounded-xl border border-gray-600 bg-gray-900/60 p-3 text-sm text-gray-200">
      <div className="mb-2 font-bold text-yellow-400">직원 초대 (기기별 토큰)</div>
      {loading ? <p className="text-xs text-gray-400">불러오는 중…</p> : null}
      <div className="space-y-3">
        {invites.map((inv) => {
          const link = inv.url || `${typeof window !== 'undefined' ? window.location.origin : ''}/staff-chat?t=${inv.token}`;
          return (
            <div key={inv.id} className="rounded-lg border border-gray-700 bg-gray-800/80 p-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold text-white">{inv.display_name}</div>
                  <div className="text-[10px] text-gray-400">{inv.role} · {inv.enabled ? '활성' : '비활성'}</div>
                  <div className="mt-1 break-all text-[11px] text-blue-300">{link}</div>
                </div>
                <img src={qrUrl(link)} alt="" className="h-[72px] w-[72px] rounded bg-white p-1" />
              </div>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => void navigator.clipboard.writeText(link)}
                  className="rounded border border-gray-600 px-2 py-0.5 text-[10px]"
                >
                  링크 복사
                </button>
                <button
                  type="button"
                  onClick={() => void toggleEnabled(inv.id, !inv.enabled)}
                  className="rounded border border-gray-600 px-2 py-0.5 text-[10px]"
                >
                  {inv.enabled ? '비활성화' : '활성화'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="표시 이름 (예: Cleaner-1)"
          className="min-w-[10rem] flex-1 rounded border border-gray-600 bg-gray-700 px-2 py-1 text-xs"
        />
        <select value={role} onChange={(e) => setRole(e.target.value)} className="rounded border border-gray-600 bg-gray-700 px-2 py-1 text-xs">
          <option value="cleaning">cleaning</option>
          <option value="cleaning2">cleaning2</option>
          <option value="front">front</option>
        </select>
        <button type="button" onClick={() => void handleCreate()} className="rounded bg-[#FEE500] px-3 py-1 text-xs font-bold text-gray-900">
          직원 초대
        </button>
      </div>
    </div>
  );
}
