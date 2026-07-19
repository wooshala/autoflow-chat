'use client';

// Phase 1F.12 — minimal staff-account login modal for customer translation.
// REUSES the existing endpoints (no new auth backend): GET /api/staff/login/roster
// + POST /api/staff/login (which wraps loginWithCode) and persists the issued
// session with saveStaffSession — exactly like StaffChatClient's inline login.
// The existing login UI lives inline inside StaffChatClient (not a shared
// component), so this is the smallest reusable surface that calls the same flow.
//
// It authenticates ONLY (name select + 4-digit code). No account creation, no
// password reset, no name-only bypass. On success it closes and calls onSuccess;
// it NEVER auto-sends the pending reply (the operator re-sends manually).
//
// Security: the session token and the login code are never logged.

import { useCallback, useEffect, useRef, useState } from 'react';

import { getOrCreateStaffDeviceKey } from '@/lib/auth/staffDeviceKey';
import { saveStaffSession } from '@/lib/auth/staffAccountSession';
import {
  parseStaffLoginResponse,
  staffLoginErrorMessage,
} from '@/lib/customer-service/customerReplyAuth';

const STAFF_LOGIN_URL = '/api/staff/login';
const STAFF_LOGIN_ROSTER_URL = '/api/staff/login/roster';

type RosterItem = { accountId: string; displayName: string };

export function StaffAuthModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [roster, setRoster] = useState<RosterItem[]>([]);
  const [accountId, setAccountId] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  // Load the active-account roster once on open (best-effort).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(STAFF_LOGIN_ROSTER_URL, { cache: 'no-store' });
        const json = await res.json();
        const list: RosterItem[] = Array.isArray(json?.data?.roster) ? json.data.roster : [];
        if (alive) setRoster(list);
      } catch {
        /* roster is best-effort; the code input still works */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const handleLogin = useCallback(async () => {
    if (submittingRef.current) return; // duplicate-submit guard
    if (!accountId || !/^\d{4}$/.test(code)) {
      setError('이름을 선택하고 4자리 코드를 입력해 주세요.');
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(STAFF_LOGIN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: accountId, login_code: code, device_key: getOrCreateStaffDeviceKey() }),
      });
      const json = await res.json().catch(() => null);
      const parsed = parseStaffLoginResponse({ ok: res.ok }, json);
      if (!parsed.ok) {
        setError(staffLoginErrorMessage(parsed.errorCode));
        return;
      }
      saveStaffSession(parsed.sessionToken, {
        accountId: parsed.account.accountId,
        userId: parsed.account.userId,
      });
      onSuccess();
    } catch {
      setError('네트워크 오류입니다. 다시 시도해 주세요.');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }, [accountId, code, onSuccess]);

  return (
    <div
      className="fixed inset-0 z-[10050] flex items-center justify-center bg-black/50 px-4"
      role="dialog"
      aria-modal="true"
      aria-label="직원 인증"
    >
      <div className="w-full max-w-xs rounded-2xl border border-gray-200 bg-white p-5 shadow-xl">
        <h2 className="mb-1 text-base font-bold text-gray-900">직원 인증</h2>
        <p className="mb-4 text-xs text-gray-500">고객 번역은 정식 직원 계정 로그인이 필요합니다.</p>

        <label className="mb-1 block text-xs font-semibold text-gray-600" htmlFor="staff-auth-name">
          이름
        </label>
        <select
          id="staff-auth-name"
          value={accountId}
          onChange={(e) => {
            setAccountId(e.target.value);
            if (error) setError(null);
          }}
          className="mb-3 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
        >
          <option value="">이름 선택</option>
          {roster.map((r) => (
            <option key={r.accountId} value={r.accountId}>
              {r.displayName}
            </option>
          ))}
        </select>

        <label className="mb-1 block text-xs font-semibold text-gray-600" htmlFor="staff-auth-code">
          4자리 코드
        </label>
        <input
          id="staff-auth-code"
          value={code}
          onChange={(e) => {
            setCode(e.target.value.replace(/\D/g, '').slice(0, 4));
            if (error) setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !submitting) {
              e.preventDefault();
              void handleLogin();
            }
          }}
          inputMode="numeric"
          autoComplete="off"
          placeholder="••••"
          className="mb-3 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-center text-lg tracking-[0.5em] text-gray-900"
        />

        {error ? <p className="mb-3 text-xs text-rose-600">{error}</p> : null}

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => void handleLogin()}
            disabled={!accountId || code.length !== 4 || submitting}
            className="rounded-lg bg-[#FEE500] px-4 py-2 text-sm font-bold text-gray-900 disabled:opacity-50"
          >
            {submitting ? '로그인 중…' : '로그인'}
          </button>
        </div>
      </div>
    </div>
  );
}
