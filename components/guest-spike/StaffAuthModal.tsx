'use client';

// Phase 1H.7 — minimal staff login for the guest-chat boundary. REUSES the existing
// endpoints/flow (no new auth): GET /api/staff/login/roster + POST /api/staff/login
// (loginWithCode) → saveStaffSession (same storage /staff-chat uses). Name + 4-digit code.
// Not a duplicate token store; not a StaffChatClient refactor (small adapter only).

import { useCallback, useEffect, useRef, useState } from 'react';

import { getOrCreateStaffDeviceKey } from '@/lib/auth/staffDeviceKey';
import { saveStaffSession } from '@/lib/auth/staffAccountSession';

const LOGIN_URL = '/api/staff/login';
const ROSTER_URL = '/api/staff/login/roster';

type RosterItem = { accountId: string; displayName: string };

export function StaffAuthModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [roster, setRoster] = useState<RosterItem[]>([]);
  const [accountId, setAccountId] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(ROSTER_URL, { cache: 'no-store' });
        const j = await res.json();
        const list: RosterItem[] = Array.isArray(j?.data?.roster) ? j.data.roster : [];
        if (alive) setRoster(list);
      } catch {
        /* roster best-effort */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const login = useCallback(async () => {
    if (submittingRef.current) return;
    if (!accountId || !/^\d{4}$/.test(code)) {
      setError('이름을 선택하고 4자리 코드를 입력해 주세요.');
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(LOGIN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: accountId, login_code: code, device_key: getOrCreateStaffDeviceKey() }),
      });
      const j = await res.json().catch(() => null);
      const token = j?.data?.sessionToken;
      const account = j?.data?.account;
      if (!res.ok || !j?.ok || typeof token !== 'string' || !account?.accountId || !account?.userId) {
        setError(j?.error === 'LOGIN_LOCKED' ? '시도가 많아 잠시 잠겼습니다. 잠시 후 다시 시도해 주세요.' : '코드가 올바르지 않습니다.');
        return;
      }
      saveStaffSession(token, { accountId: account.accountId, userId: account.userId });
      onSuccess();
    } catch {
      setError('네트워크 오류입니다. 다시 시도해 주세요.');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }, [accountId, code, onSuccess]);

  return (
    <div className="fixed inset-0 z-[10050] flex items-center justify-center bg-black/50 px-4" role="dialog" aria-modal="true" aria-label="직원 인증">
      <div className="w-full max-w-xs rounded-2xl border border-gray-200 bg-white p-5 shadow-xl">
        <h2 className="mb-1 text-base font-bold text-gray-900">직원 인증</h2>
        <p className="mb-4 text-xs text-gray-500">고객 채팅은 직원 계정 로그인이 필요합니다.</p>
        <select
          value={accountId}
          onChange={(e) => { setAccountId(e.target.value); if (error) setError(null); }}
          className="mb-3 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
        >
          <option value="">이름 선택</option>
          {roster.map((r) => (
            <option key={r.accountId} value={r.accountId}>{r.displayName}</option>
          ))}
        </select>
        <input
          value={code}
          onChange={(e) => { setCode(e.target.value.replace(/\D/g, '').slice(0, 4)); if (error) setError(null); }}
          onKeyDown={(e) => { if (e.key === 'Enter' && !submitting) { e.preventDefault(); void login(); } }}
          inputMode="numeric"
          autoComplete="off"
          placeholder="••••"
          className="mb-3 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-center text-lg tracking-[0.5em] text-gray-900"
        />
        {error ? <p className="mb-3 text-xs text-rose-600">{error}</p> : null}
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} disabled={submitting} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 disabled:opacity-50">취소</button>
          <button type="button" onClick={() => void login()} disabled={!accountId || code.length !== 4 || submitting} className="rounded-lg bg-[#FEE500] px-4 py-2 text-sm font-bold text-gray-900 disabled:opacity-50">
            {submitting ? '로그인 중…' : '로그인'}
          </button>
        </div>
      </div>
    </div>
  );
}
