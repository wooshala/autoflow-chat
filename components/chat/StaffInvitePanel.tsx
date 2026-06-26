'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchEnvelope } from '@/lib/api/envelope';
import { createClient as createBrowserSupabase } from '@/utils/supabase/client';
import { STAFF_ENTRY_INVITE_URL, STAFF_INVITES_URL } from '@/lib/chatApi';
import { formatRelativeKST } from '@/lib/formatKST';
import type { StaffInvite } from '@/lib/types';

type InviteRow = StaffInvite & { url?: string };

type Props = {
  /** Chat main area: light collapsible bar. Admin drawer: dark full panel. */
  variant?: 'chat' | 'admin';
  collapsible?: boolean;
  defaultOpen?: boolean;
};

/** Broadcast channel for the per-staff "🔔 테스트" ping (ephemeral, no DB row). */
export const STAFF_TEST_CHANNEL = 'autoflow-staff-test';
export const STAFF_TEST_EVENT = 'staff-test';

const ACTIVE_WINDOW_MS = 10 * 60 * 1000;

function isRecentlyActive(lastSeen: string | null | undefined): boolean {
  if (!lastSeen) return false;
  return Date.now() - new Date(lastSeen).getTime() < ACTIVE_WINDOW_MS;
}

function qrUrl(link: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(link)}`;
}

/** Operator-facing text only — never leak ids/tokens/[object Object]. */
function safeText(v: unknown, fallback: string): string {
  if (typeof v === 'string') {
    const t = v.trim();
    return t && t !== '[object Object]' ? t : fallback;
  }
  return fallback;
}

function roleIcon(role: unknown): string {
  const r = safeText(role, '').toLowerCase();
  if (/clean|house|maid|청소/.test(r)) return '🧹';
  if (/front|recept|desk|프론트/.test(r)) return '🛎️';
  if (/manage|admin|관리|매니저|사장/.test(r)) return '👔';
  if (/engineer|maint|설비|시설/.test(r)) return '🔧';
  return '👤';
}

function langLabel(lang: unknown): string {
  const l = safeText(lang, '').toLowerCase();
  if (!l) return '언어 미설정';
  if (l.startsWith('ko')) return '한국어';
  if (l.startsWith('ru')) return '러시아어';
  if (l.startsWith('en')) return '영어';
  if (l.startsWith('vi')) return '베트남어';
  if (l.startsWith('zh')) return '중국어';
  return safeText(lang, '언어 미설정');
}

type StatusKind = 'online' | 'offline' | 'removed';
function statusOf(inv: InviteRow): StatusKind {
  if (!inv.enabled) return 'removed';
  return isRecentlyActive(inv.last_seen_at) ? 'online' : 'offline';
}
const STATUS_META: Record<StatusKind, { dot: string; label: string; cls: string }> = {
  online: { dot: '🟢', label: '온라인', cls: 'text-emerald-600' },
  offline: { dot: '⚪', label: '오프라인', cls: 'text-gray-400' },
  removed: { dot: '🔴', label: '내보냄', cls: 'text-rose-500' }
};

export default function StaffInvitePanel({
  variant = 'admin',
  collapsible = false,
  defaultOpen = true
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const [showQr, setShowQr] = useState(false);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [entryUrl, setEntryUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rotatingEntry, setRotatingEntry] = useState(false);
  const [testedId, setTestedId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const isChat = variant === 'chat';
  const participantCount = invites.filter((i) => i.enabled).length;

  // Supabase channel used only to SEND the per-staff test ping.
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const testChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  useEffect(() => {
    const ch = supabase.channel(STAFF_TEST_CHANNEL, { config: { broadcast: { ack: false } } });
    ch.subscribe();
    testChannelRef.current = ch;
    return () => {
      try {
        supabase.removeChannel(ch);
      } catch {
        /* ignore */
      }
    };
  }, [supabase]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const [listRes, entryRes] = await Promise.all([
      fetchEnvelope<{ invites: InviteRow[] }>(STAFF_INVITES_URL),
      fetchEnvelope<{ url: string }>(STAFF_ENTRY_INVITE_URL)
    ]);
    if (listRes.ok && listRes.data?.invites) setInvites(listRes.data.invites);
    if (entryRes.ok && entryRes.data?.url) setEntryUrl(entryRes.data.url);
    if (!listRes.ok) setLoadError('참여자 목록을 불러오지 못했습니다.');
    else if (!entryRes.ok) setLoadError('입장 QR을 불러오지 못했습니다.');
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleRevoke(inv: InviteRow) {
    const name = safeText(inv.display_name, '이 직원');
    if (!window.confirm(`"${name}"님을 내보낼까요?\n내보내면 더 이상 채팅에 참여할 수 없습니다.`)) return;
    await fetch(STAFF_INVITES_URL, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: inv.id, action: 'revoke' })
    });
    void load();
  }

  async function handleRotateEntry() {
    if (!window.confirm('새 QR을 만들면 이전 QR은 사용할 수 없게 됩니다. 계속할까요?')) return;
    setRotatingEntry(true);
    try {
      const res = await fetch(STAFF_INVITES_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'rotate_entry' })
      });
      const json = await res.json();
      if (json?.ok && json?.data?.url) {
        setEntryUrl(json.data.url);
        setShowQr(true);
      }
    } finally {
      setRotatingEntry(false);
    }
  }

  async function handleTest(inv: InviteRow) {
    const ch = testChannelRef.current;
    if (!ch) return;
    try {
      await ch.send({
        type: 'broadcast',
        event: STAFF_TEST_EVENT,
        payload: {
          target_invite_id: inv.id,
          target_name: safeText(inv.display_name, '직원'),
          text: '테스트입니다.'
        }
      });
      setTestedId(inv.id);
      setTimeout(() => setTestedId((cur) => (cur === inv.id ? null : cur)), 2500);
    } catch {
      /* ignore — operator can retry */
    }
  }

  async function copyLink() {
    if (!entryUrl) return;
    try {
      await navigator.clipboard.writeText(entryUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  const btnBase =
    'inline-flex items-center justify-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50';

  const body = (
    <>
      {/* ── QR: 새 직원 추가 (가장 위) ─────────────────────────── */}
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
        <div className="mb-2 text-sm font-bold text-emerald-900">새 직원 추가</div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowQr((v) => !v)}
            className={`${btnBase} border border-emerald-300 bg-white text-emerald-800 hover:bg-emerald-100`}
          >
            {showQr ? 'QR 숨기기' : 'QR 보기'}
          </button>
          <button
            type="button"
            disabled={rotatingEntry}
            onClick={() => void handleRotateEntry()}
            className={`${btnBase} border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100`}
          >
            {rotatingEntry ? '재발급 중…' : 'QR 재발급'}
          </button>
        </div>
        {showQr ? (
          <div className="mt-3 flex flex-col items-center gap-2">
            {entryUrl ? (
              <>
                <img
                  src={qrUrl(entryUrl)}
                  alt="직원 입장 QR"
                  className="h-44 w-44 rounded-lg border border-emerald-200 bg-white p-2"
                />
                <p className="text-center text-xs text-emerald-800">
                  직원 휴대폰 카메라로 이 QR을 찍으면 바로 입장합니다.
                </p>
                <button
                  type="button"
                  onClick={() => void copyLink()}
                  className={`${btnBase} border border-gray-300 bg-white text-gray-700 hover:bg-gray-50`}
                >
                  {copied ? '복사됨 ✓' : '링크 복사'}
                </button>
              </>
            ) : (
              <p className="text-xs text-gray-500">QR을 불러오는 중…</p>
            )}
          </div>
        ) : null}
      </div>

      {/* ── 현재 참여자 ─────────────────────────────────────── */}
      <div className="mt-3 mb-1.5 text-sm font-bold text-gray-800">현재 참여자</div>

      {loadError ? (
        <p className="text-xs text-rose-600" role="alert">
          {loadError}
          <button type="button" onClick={() => void load()} className="ml-2 underline">
            다시 시도
          </button>
        </p>
      ) : null}
      {loading && invites.length === 0 ? (
        <p className="text-xs text-gray-500">불러오는 중…</p>
      ) : null}

      {!loading && invites.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white px-3 py-6 text-center text-sm text-gray-500">
          아직 직원이 없어요.
          <br />위 <span className="font-semibold text-emerald-700">QR 보기</span>를 눌러 직원에게 보여주세요.
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {invites.map((inv) => {
          const s = statusOf(inv);
          const meta = STATUS_META[s];
          const name = safeText(inv.display_name, '직원');
          const removed = s === 'removed';
          return (
            <div
              key={inv.id}
              className={`rounded-xl border p-3 ${
                removed ? 'border-gray-200 bg-gray-50 opacity-70' : 'border-gray-200 bg-white'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span aria-hidden>{meta.dot}</span>
                    <span className="text-base">{roleIcon(inv.role)}</span>
                    <span className="truncate text-sm font-bold text-gray-900">{name}</span>
                  </div>
                  <div className="mt-1 text-xs text-gray-500">{langLabel(inv.spoken_lang)}</div>
                </div>
                <span className={`shrink-0 text-xs font-semibold ${meta.cls}`}>{meta.label}</span>
              </div>

              <div className="mt-1.5 text-xs text-gray-500">
                최근 접속 · {formatRelativeKST(inv.last_seen_at)}
              </div>

              {!removed ? (
                <div className="mt-2.5 flex gap-2">
                  <button
                    type="button"
                    onClick={() => void handleTest(inv)}
                    className={`${btnBase} flex-1 border border-sky-300 bg-sky-50 text-sky-800 hover:bg-sky-100`}
                  >
                    {testedId === inv.id ? '보냈어요 ✓' : '🔔 테스트'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleRevoke(inv)}
                    className={`${btnBase} flex-1 border border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100`}
                  >
                    ❌ 내보내기
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </>
  );

  // Collapsible header used inside the /chat surface.
  if (collapsible) {
    const countLabel = loading && invites.length === 0 ? '…' : String(participantCount);
    return (
      <div className="shrink-0 border-b border-gray-200 bg-gray-50 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left text-sm font-bold text-gray-900 hover:bg-gray-100"
          aria-expanded={open}
        >
          <span>👥 참여자 관리 ({countLabel}명)</span>
          <span aria-hidden className="text-gray-400">{open ? '▼' : '▶'}</span>
        </button>
        {open ? (
          <div className="mt-1 max-h-[min(60vh,560px)] overflow-y-auto px-1 pb-2">{body}</div>
        ) : null}
      </div>
    );
  }

  return <div className="p-1">{body}</div>;
}
