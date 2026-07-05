'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchEnvelope } from '@/lib/api/envelope';
import { createClient as createBrowserSupabase } from '@/utils/supabase/client';
import { STAFF_ENTRY_INVITE_URL, STAFF_INVITES_URL } from '@/lib/chatApi';
import { formatRelativeKST } from '@/lib/formatKST';
import {
  STAFF_WORK_STATUS_OPTIONS,
  STAFF_STATUS_CHANNEL,
  STAFF_STATUS_EVENT,
  staffWorkStatusMeta,
  type StaffWorkStatus
} from '@/lib/chat/staffStatus';
import type { ChatMessage, StaffInvite } from '@/lib/types';

type InviteRow = StaffInvite & { url?: string };

type Props = {
  /** Chat main area: light collapsible bar. Admin drawer: dark full panel. */
  variant?: 'chat' | 'admin';
  collapsible?: boolean;
  defaultOpen?: boolean;
  /** Loaded chat messages — used to derive each staff's "마지막 메시지" time. */
  messages?: ChatMessage[];
  /** Report participant counts so the header can show them (display only; the
   * presence/invite logic here is unchanged). */
  onCountsChange?: (counts: { online: number; total: number }) => void;
};

/** Broadcast channel for the per-staff "🔔 테스트" ping (ephemeral, no DB row). */
export const STAFF_TEST_CHANNEL = 'autoflow-staff-test';
export const STAFF_TEST_EVENT = 'staff-test';

const POLL_MS = 20_000; // keep last_seen / joins fresh while the panel is mounted
const TICK_MS = 15_000; // recompute online → away → offline over time
const ONLINE_MS = 60_000;
const AWAY_MS = 5 * 60_000;
const EVENTS_KEY = 'autoflow_staff_events';
const EVENTS_MAX = 20;

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

function langLabel(lang: unknown): string {
  const l = safeText(lang, '').toLowerCase();
  if (!l) return '🌐 언어 미설정';
  if (l.startsWith('ko')) return '🇰🇷 한국어';
  if (l.startsWith('ru')) return '🇷🇺 러시아어';
  if (l.startsWith('en')) return '🇺🇸 영어';
  if (l.startsWith('vi')) return '🇻🇳 베트남어';
  if (l.startsWith('zh')) return '🇨🇳 중국어';
  return `🌐 ${safeText(lang, '언어 미설정')}`;
}

type StatusKind = 'online' | 'away' | 'offline' | 'removed';

function statusOf(inv: InviteRow, now: number): StatusKind {
  if (!inv.enabled) return 'removed';
  if (!inv.last_seen_at) return 'offline';
  const age = now - new Date(inv.last_seen_at).getTime();
  if (age <= ONLINE_MS) return 'online';
  if (age <= AWAY_MS) return 'away';
  return 'offline';
}

const STATUS_META: Record<StatusKind, { dot: string; label: string; cls: string; order: number }> = {
  online: { dot: '🟢', label: '온라인', cls: 'text-emerald-600', order: 0 },
  away: { dot: '🟡', label: '자리 비움', cls: 'text-amber-500', order: 1 },
  offline: { dot: '⚪', label: '오프라인', cls: 'text-gray-400', order: 2 },
  removed: { dot: '🔴', label: '내보냄', cls: 'text-rose-500', order: 3 }
};

type StaffEvent = { ts: number; text: string };

function loadEvents(): StaffEvent[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(EVENTS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.slice(0, EVENTS_MAX) : [];
  } catch {
    return [];
  }
}

export default function StaffInvitePanel({
  variant = 'admin',
  collapsible = false,
  defaultOpen = true,
  messages,
  onCountsChange
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const [showQr, setShowQr] = useState(true);
  const [showLog, setShowLog] = useState(false);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [entryUrl, setEntryUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rotatingEntry, setRotatingEntry] = useState(false);
  const [testState, setTestState] = useState<Record<string, 'sending' | 'done'>>({});
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [events, setEvents] = useState<StaffEvent[]>([]);

  const seenIdsRef = useRef<Set<string>>(new Set());
  const prevStatusRef = useRef<Map<string, string>>(new Map());
  const seededRef = useRef(false);

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

  useEffect(() => {
    setEvents(loadEvents());
  }, []);

  const logEvent = useCallback((text: string) => {
    setEvents((prev) => {
      const next = [{ ts: Date.now(), text }, ...prev].slice(0, EVENTS_MAX);
      try {
        window.localStorage.setItem(EVENTS_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  // Apply a freshly-fetched invite list and log newly-joined staff (after seed).
  const applyInvites = useCallback(
    (next: InviteRow[]) => {
      setInvites(next);
      if (!seededRef.current) {
        for (const inv of next) {
          if (inv.enabled) seenIdsRef.current.add(String(inv.id));
          prevStatusRef.current.set(String(inv.id), staffWorkStatusMeta(inv.current_status).key);
        }
        seededRef.current = true;
        return;
      }
      for (const inv of next) {
        const id = String(inv.id);
        if (inv.enabled && !seenIdsRef.current.has(id)) {
          seenIdsRef.current.add(id);
          logEvent(`${safeText(inv.display_name, '직원')} 입장`);
        }
        if (inv.enabled) {
          const nextStatus = staffWorkStatusMeta(inv.current_status).key;
          const prev = prevStatusRef.current.get(id);
          if (prev && prev !== nextStatus) {
            logEvent(`${safeText(inv.display_name, '직원')} → ${staffWorkStatusMeta(nextStatus).label}`);
          }
          prevStatusRef.current.set(id, nextStatus);
        }
      }
    },
    [logEvent]
  );

  const load = useCallback(
    async (opts?: { quiet?: boolean }) => {
      if (!opts?.quiet) setLoading(true);
      setLoadError(null);
      const [listRes, entryRes] = await Promise.all([
        fetchEnvelope<{ invites: InviteRow[] }>(STAFF_INVITES_URL),
        fetchEnvelope<{ url: string }>(STAFF_ENTRY_INVITE_URL)
      ]);
      if (listRes.ok && listRes.data?.invites) applyInvites(listRes.data.invites);
      if (entryRes.ok && entryRes.data?.url) setEntryUrl(entryRes.data.url);
      if (!listRes.ok) setLoadError('참여자 목록을 불러오지 못했습니다.');
      else if (!entryRes.ok && !entryUrl) setLoadError('입장 QR을 불러오지 못했습니다.');
      if (!opts?.quiet) setLoading(false);
    },
    [applyInvites, entryUrl]
  );

  // Initial load + background polling (kept running even while collapsed, so the
  // panel shows the latest state immediately when reopened).
  useEffect(() => {
    void load();
    const poll = setInterval(() => void load({ quiet: true }), POLL_MS);
    const tick = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Instant refresh when any staff changes their work status (broadcast ping).
  useEffect(() => {
    const ch = supabase.channel(STAFF_STATUS_CHANNEL, { config: { broadcast: {} } });
    ch.on('broadcast', { event: STAFF_STATUS_EVENT }, () => void load({ quiet: true }));
    ch.subscribe();
    return () => {
      try {
        supabase.removeChannel(ch);
      } catch {
        /* ignore */
      }
    };
  }, [supabase, load]);

  // Per-staff last message time, derived from loaded messages (mobile senders).
  const lastMsgByKey = useMemo(() => {
    const byUser = new Map<string, number>();
    const byName = new Map<string, number>();
    for (const m of messages ?? []) {
      if (!m || m.sender_side !== 'mobile') continue;
      const t = m.created_at ? new Date(m.created_at).getTime() : NaN;
      if (!Number.isFinite(t)) continue;
      const uid = m.user_id ? String(m.user_id) : '';
      const nm = safeText((m as { sender_name?: unknown }).sender_name ?? (m as { actor_name?: unknown }).actor_name, '');
      if (uid) byUser.set(uid, Math.max(byUser.get(uid) ?? 0, t));
      if (nm) byName.set(nm, Math.max(byName.get(nm) ?? 0, t));
    }
    return { byUser, byName };
  }, [messages]);

  function lastMsgAt(inv: InviteRow): number | null {
    const uid = inv.user_id ? String(inv.user_id) : '';
    const nm = safeText(inv.display_name, '');
    const t = (uid && lastMsgByKey.byUser.get(uid)) || (nm && lastMsgByKey.byName.get(nm)) || 0;
    return t || null;
  }

  const sortedInvites = useMemo(() => {
    // Primary: work status (available→cleaning→break→outside→off_duty→removed).
    const wsOrder = (inv: InviteRow) => (inv.enabled ? staffWorkStatusMeta(inv.current_status).order : 5);
    return [...invites].sort((a, b) => {
      const wa = wsOrder(a);
      const wb = wsOrder(b);
      if (wa !== wb) return wa - wb;
      // Secondary: online → away → offline.
      const ta2 = STATUS_META[statusOf(a, now)].order;
      const tb2 = STATUS_META[statusOf(b, now)].order;
      if (ta2 !== tb2) return ta2 - tb2;
      // Tertiary: most recently seen first.
      const ta = a.last_seen_at ? new Date(a.last_seen_at).getTime() : 0;
      const tb = b.last_seen_at ? new Date(b.last_seen_at).getTime() : 0;
      return tb - ta;
    });
  }, [invites, now]);

  const totalCount = invites.filter((i) => i.enabled).length;
  const onlineCount = invites.filter((i) => statusOf(i, now) === 'online').length;

  // Report counts upward (display only) so the chat header can show 온라인 수.
  useEffect(() => {
    onCountsChange?.({ online: onlineCount, total: totalCount });
  }, [onlineCount, totalCount, onCountsChange]);

  async function handleRevoke(inv: InviteRow) {
    const name = safeText(inv.display_name, '이 직원');
    if (!window.confirm(`"${name}"님을 내보낼까요?\n내보내면 더 이상 채팅에 참여할 수 없습니다.`)) return;
    // Optimistic: flip to 내보냄 immediately, don't wait for refetch.
    setInvites((prev) => prev.map((i) => (i.id === inv.id ? { ...i, enabled: false } : i)));
    logEvent(`${name} 내보냄`);
    try {
      await fetch(STAFF_INVITES_URL, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: inv.id, action: 'revoke' })
      });
    } finally {
      void load({ quiet: true });
    }
  }

  async function handleSetStatus(inv: InviteRow, status: StaffWorkStatus) {
    // Optimistic; the status-change log fires on the subsequent quiet reload.
    setInvites((prev) => prev.map((i) => (i.id === inv.id ? { ...i, current_status: status } : i)));
    try {
      await fetch(STAFF_INVITES_URL, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: inv.id, action: 'set_status', status })
      });
    } finally {
      void load({ quiet: true });
    }
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
        logEvent('QR 재발급');
      }
    } finally {
      setRotatingEntry(false);
    }
  }

  async function handleTest(inv: InviteRow) {
    const ch = testChannelRef.current;
    if (!ch || testState[inv.id]) return; // ignore double-clicks while in progress
    const name = safeText(inv.display_name, '직원');
    setTestState((s) => ({ ...s, [inv.id]: 'sending' }));
    try {
      await ch.send({
        type: 'broadcast',
        event: STAFF_TEST_EVENT,
        payload: { target_invite_id: inv.id, target_name: name, text: '테스트입니다.' }
      });
      setTestState((s) => ({ ...s, [inv.id]: 'done' }));
      logEvent(`${name}에게 테스트 전송`);
    } catch {
      setTestState((s) => {
        const n = { ...s };
        delete n[inv.id];
        return n;
      });
      return;
    }
    setTimeout(() => {
      setTestState((s) => {
        const n = { ...s };
        delete n[inv.id];
        return n;
      });
    }, 2000);
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
    'inline-flex items-center justify-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

  const hasInvites = invites.length > 0;

  const body = (
    <>
      {/* ── 직원 초대 (QR, 가장 위) ─────────────────────────── */}
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
        <div className="mb-2 text-sm font-bold text-emerald-900">직원 초대</div>
        {showQr ? (
          <div className="flex flex-col items-center gap-2">
            {entryUrl ? (
              <img
                src={qrUrl(entryUrl)}
                alt="직원 입장 QR"
                className="h-40 w-40 rounded-lg border border-emerald-200 bg-white p-2"
              />
            ) : (
              <div className="flex h-40 w-40 items-center justify-center rounded-lg border border-emerald-200 bg-white text-xs text-gray-400">
                QR 불러오는 중…
              </div>
            )}
            <p className="text-center text-xs text-emerald-800">
              직원 휴대폰 카메라로 이 QR을 찍으면 바로 입장합니다.
            </p>
          </div>
        ) : null}
        <div className="mt-2.5 flex flex-wrap justify-center gap-2">
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
          <button
            type="button"
            disabled={!entryUrl}
            onClick={() => void copyLink()}
            className={`${btnBase} border border-gray-300 bg-white text-gray-700 hover:bg-gray-50`}
          >
            {copied ? '복사됨 ✓' : '링크 복사'}
          </button>
        </div>
      </div>

      {loadError ? (
        <p className="mt-2 text-xs text-rose-600" role="alert">
          {loadError}
          <button type="button" onClick={() => void load()} className="ml-2 underline">
            다시 시도
          </button>
        </p>
      ) : null}
      {loading && !hasInvites ? <p className="mt-2 text-xs text-gray-500">불러오는 중…</p> : null}

      {!loading && !hasInvites ? (
        <div className="mt-2 rounded-xl border border-dashed border-gray-300 bg-white px-3 py-6 text-center text-sm text-gray-500">
          아직 참여한 직원이 없습니다.
          <br />
          <span className="font-semibold text-emerald-700">QR을 스캔하여 입장</span>하세요.
        </div>
      ) : null}

      {hasInvites ? (
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {sortedInvites.map((inv) => {
            const s = statusOf(inv, now);
            const meta = STATUS_META[s];
            const name = safeText(inv.display_name, '직원');
            const removed = s === 'removed';
            const ts = testState[inv.id];
            const lastMsg = lastMsgAt(inv);
            const wsMeta = staffWorkStatusMeta(inv.current_status);
            return (
              <div
                key={inv.id}
                className={`rounded-xl border p-3 ${
                  removed ? 'border-gray-200 bg-gray-50 opacity-70' : 'border-gray-200 bg-white'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span aria-hidden className="text-base">{meta.dot}</span>
                    <span className="truncate text-sm font-bold text-gray-900">{name}</span>
                  </div>
                  <span className={`shrink-0 text-xs font-bold ${meta.cls}`}>{meta.label}</span>
                </div>

                {!removed ? (
                  <div className="mt-1 flex items-center gap-1.5 text-sm font-bold text-gray-800">
                    <span aria-hidden>{wsMeta.icon}</span>
                    <span>{wsMeta.label}</span>
                  </div>
                ) : null}

                <div className="mt-1.5 text-sm text-gray-700">{langLabel(inv.spoken_lang)}</div>

                <div className="mt-2 flex gap-4">
                  <div>
                    <div className="text-[11px] text-gray-400">최근 접속</div>
                    <div className="text-sm font-semibold text-gray-800">
                      {formatRelativeKST(inv.last_seen_at)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-gray-400">마지막 메시지</div>
                    <div className="text-sm text-gray-500">
                      {lastMsg ? formatRelativeKST(new Date(lastMsg)) : '없음'}
                    </div>
                  </div>
                </div>

                {!removed ? (
                  <div className="mt-2">
                    <label className="text-[11px] text-gray-400">상태 변경 (관리자)</label>
                    <select
                      value={wsMeta.key}
                      onChange={(e) => void handleSetStatus(inv, e.target.value as StaffWorkStatus)}
                      className="mt-0.5 w-full rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-gray-700"
                      aria-label={`${name} 상태 변경`}
                    >
                      {STAFF_WORK_STATUS_OPTIONS.map((o) => (
                        <option key={o.key} value={o.key}>
                          {o.icon} {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}

                {!removed ? (
                  <div className="mt-2.5 flex gap-2">
                    <button
                      type="button"
                      disabled={Boolean(ts)}
                      onClick={() => void handleTest(inv)}
                      className={`${btnBase} flex-1 border border-sky-300 bg-sky-50 text-sky-800 hover:bg-sky-100`}
                    >
                      {ts === 'sending' ? '전송중…' : ts === 'done' ? '전송 완료 ✓' : '🔔 테스트'}
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
      ) : null}

      {/* ── 최근 활동 (관리자 운영 로그) ─────────────────────── */}
      {events.length > 0 ? (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowLog((v) => !v)}
            className="flex w-full items-center justify-between rounded-lg px-1 py-1 text-xs font-semibold text-gray-500 hover:text-gray-700"
            aria-expanded={showLog}
          >
            <span>최근 활동 ({events.length})</span>
            <span aria-hidden>{showLog ? '▼' : '▶'}</span>
          </button>
          {showLog ? (
            <ul className="mt-1 space-y-1 rounded-lg border border-gray-200 bg-white p-2">
              {events.map((e, i) => (
                <li key={`${e.ts}-${i}`} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate text-gray-700">{e.text}</span>
                  <span className="shrink-0 text-gray-400">{formatRelativeKST(new Date(e.ts))}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </>
  );

  // Collapsible header used inside the /chat surface.
  if (collapsible) {
    return (
      <div className="shrink-0 border-b border-gray-200 bg-gray-50 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between rounded-lg px-2 py-2 text-left hover:bg-gray-100"
          aria-expanded={open}
        >
          <span className="flex flex-wrap items-baseline gap-x-2 text-sm font-bold text-gray-900">
            <span>👥 참여자 관리</span>
            <span className="text-xs font-normal text-gray-500">
              {loading && !hasInvites ? '…' : `${totalCount}명`} · 🟢 {onlineCount}명 온라인
            </span>
          </span>
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
