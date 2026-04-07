'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ChatMessage } from '@/lib/types';
import { loadUser, logoutAndGoLogin, resolveChatSendUserId, runSessionMigration } from '@/lib/auth';
import { fetchEnvelope } from '@/lib/api/envelope';
import { CHAT_LIST_URL, CHAT_SEND_URL } from '@/lib/chatApi';
import { TIMEOUT_MS_CHAT_LIST, TIMEOUT_MS_CHAT_SEND } from '@/lib/api/timeouts';
import { unwrapChatSendEnvelopeData } from '@/lib/api/unwrapChatSendResponse';

type CardStatus = 'new' | 'checked' | 'done';
type WorkKind =
  | 'clean_done'
  | 'towel_request'
  | 'water_request'
  | 'smell_issue'
  | 'maintenance_issue'
  | 'photo_report'
  | 'general';

type WorkCard = {
  key: string; // message.id 기반
  messageId: string;
  roomNo: string | null;
  label: string;
  kind: WorkKind;
  originalText: string;
  createdAt: string;
  status: CardStatus;
  checkedBy?: string;
  checkedAt?: string;
  requestedBy?: string;
  requestedAt?: string;
  doneBy?: string;
  doneAt?: string;
};

/** 레거시: 카드별 status 문자열만 저장 */
const STORAGE_STATUS = 'front_ops_card_status_v1';
/** 카드별 상태 + 처리자(로컬, 새로고침 유지). 서버 이력 테이블은 추후 확장. */
const STORAGE_CARD_STATE_V2 = 'front_ops_card_state_v2';

type FrontOpsCardState = {
  status: CardStatus;
  checkedBy?: string;
  checkedAt?: string;
  requestedBy?: string;
  requestedAt?: string;
  doneBy?: string;
  doneAt?: string;
};
/**
 * 모바일(sender_side === 'mobile') 메시지를 카드로 보여줄 최대 경과 시간.
 *
 * 운영 실데이터(채팅 목록 100건 샘플) 기준으로 2h·24h 창에서는 모바일이 전부 창 밖이라 카드가 0이었고,
 * 48h에서만 노출이 보장되었다(재현: `node scripts/front-ops-window-compare.mjs`).
 *
 * TODO(개선): 시간 창만으로 자르지 말고, 로컬 status가 `new`/`checked`인 미완료 카드는 창 밖이어도 유지하고
 * `done`은 더 빨리 목록에서 제외하는 등 **시간 + status 혼합 정책** 검토.
 */
const MOBILE_WINDOW_MS = 48 * 60 * 60 * 1000;

function normalizeRoomNo(v: string | null | undefined): string | null {
  const s = String(v ?? '').trim();
  if (!s) return null;
  const m = s.match(/\d{3,4}/);
  return m ? m[0] : null;
}

function extractRoomFromText(text: string): string | null {
  const t = String(text || '');
  const m = t.match(/\b(\d{3,4})\b/);
  return m ? m[1] : null;
}

function parseWorkKind(msg: ChatMessage): { kind: WorkKind; label: string } {
  const text = String(msg.message || '').trim();
  const lower = text.toLowerCase();
  const hasImage = Boolean(msg.image_url) || msg.message_type === 'image';

  // 1) 사진
  if (hasImage || /사진|photo|pic/.test(lower)) {
    return { kind: 'photo_report', label: '사진 보고' };
  }

  // 2) 청소 완료
  if (/(청소\s*완료|청소완료|clean\s*done|완료했습니다|완료됨)/.test(lower)) {
    return { kind: 'clean_done', label: '청소 완료' };
  }

  // 3) 수건
  if (/(수건|towel)/.test(lower)) {
    return { kind: 'towel_request', label: '수건 요청' };
  }

  // 4) 생수/물
  if (/(생수|물\b|워터|water)/.test(lower)) {
    return { kind: 'water_request', label: '생수/물 요청' };
  }

  // 5) 냄새/담배
  if (/(담배|냄새|smell|odor)/.test(lower)) {
    return { kind: 'smell_issue', label: '냄새 이슈' };
  }

  // 6) 고장/문제/설비
  if (/(고장|문제|차단기|냉장고|tv\b|hdmi|불\s*없|전원|작동\s*안|broken|issue)/.test(lower)) {
    return { kind: 'maintenance_issue', label: '설비 이슈' };
  }

  return { kind: 'general', label: '일반' };
}

function safeParseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function parseCardStateValue(val: unknown): FrontOpsCardState | null {
  if (typeof val === 'string') {
    if (val === 'new' || val === 'checked' || val === 'done') return { status: val };
    return null;
  }
  if (!val || typeof val !== 'object') return null;
  const o = val as Record<string, unknown>;
  const s = o.status;
  if (s !== 'new' && s !== 'checked' && s !== 'done') return null;
  return {
    status: s,
    checkedBy: typeof o.checkedBy === 'string' ? o.checkedBy : undefined,
    checkedAt: typeof o.checkedAt === 'string' ? o.checkedAt : undefined,
    requestedBy: typeof o.requestedBy === 'string' ? o.requestedBy : undefined,
    requestedAt: typeof o.requestedAt === 'string' ? o.requestedAt : undefined,
    doneBy: typeof o.doneBy === 'string' ? o.doneBy : undefined,
    doneAt: typeof o.doneAt === 'string' ? o.doneAt : undefined
  };
}

function loadCardStateMap(): Record<string, FrontOpsCardState> {
  if (typeof window === 'undefined') return {};
  const v2raw = localStorage.getItem(STORAGE_CARD_STATE_V2);
  if (v2raw != null) {
    const v2parsed = safeParseJson<Record<string, unknown>>(v2raw);
    if (v2parsed && typeof v2parsed === 'object') {
      const out: Record<string, FrontOpsCardState> = {};
      for (const [k, val] of Object.entries(v2parsed)) {
        const row = parseCardStateValue(val);
        if (row) out[k] = row;
      }
      return out;
    }
    return {};
  }
  const migrated: Record<string, FrontOpsCardState> = {};
  const v1 = safeParseJson<Record<string, unknown>>(localStorage.getItem(STORAGE_STATUS));
  if (v1 && typeof v1 === 'object') {
    for (const [k, val] of Object.entries(v1)) {
      const row = parseCardStateValue(val);
      if (row) migrated[k] = row;
    }
  }
  if (Object.keys(migrated).length > 0) {
    try {
      localStorage.setItem(STORAGE_CARD_STATE_V2, JSON.stringify(migrated));
    } catch {
      // ignore
    }
  }
  return migrated;
}

function saveCardStateMap(map: Record<string, FrontOpsCardState>) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_CARD_STATE_V2, JSON.stringify(map));
  } catch {
    // ignore
  }
}

function workCardFieldsFromState(row: FrontOpsCardState | null): Pick<
  WorkCard,
  'status' | 'checkedBy' | 'checkedAt' | 'requestedBy' | 'requestedAt' | 'doneBy' | 'doneAt'
> {
  const s = row ?? { status: 'new' as const };
  return {
    status: s.status,
    checkedBy: s.checkedBy,
    checkedAt: s.checkedAt,
    requestedBy: s.requestedBy,
    requestedAt: s.requestedAt,
    doneBy: s.doneBy,
    doneAt: s.doneAt
  };
}

/**
 * 채팅 전송 API에 넣을 `user_id`(DB users.id).
 * 운영: `NEXT_PUBLIC_FRONT_OPS_SEND_USER_ID` 권장. 없으면 `NEXT_PUBLIC_CHAT_SEND_USER_ID`.
 */
function resolveFrontOpsSendUserId(): string | null {
  const envId =
    typeof process !== 'undefined' && process.env.NEXT_PUBLIC_FRONT_OPS_SEND_USER_ID
      ? String(process.env.NEXT_PUBLIC_FRONT_OPS_SEND_USER_ID).trim()
      : '';
  if (envId) return envId;
  return resolveChatSendUserId();
}

async function loadMessages(): Promise<ChatMessage[]> {
  const url = `${CHAT_LIST_URL}?${new URLSearchParams({ limit: '100' }).toString()}`;
  const r = await fetchEnvelope<{ messages: ChatMessage[] }>(url, {
    cache: 'no-store',
    timeoutMs: TIMEOUT_MS_CHAT_LIST
  });
  if (!r.ok) throw new Error(r.message || 'CHAT_LIST_FAILED');
  const msgs = Array.isArray(r.data.messages) ? r.data.messages : [];
  return msgs;
}

/**
 * actor_name: 서버로 별도 필드 전달(로그·향후 DB 컬럼/이력 테이블 분리 예정).
 * 본문 접두 `[작업자 …]` 는 당장 채팅 타임라인에서 식별 가능하게 하기 위한 임시 호환용이며, 이후 본문은 원문만 두고 actor는 DB로 옮기는 방향을 검토.
 */
async function sendFrontMessage(input: {
  userId: string;
  roomNo: string;
  message: string;
  actorName?: string | null;
}): Promise<{ ok: true; savedId: string } | { ok: false; error: string }> {
  const actor = (input.actorName?.trim() || loadUser()?.name || '알수없음').trim();
  const body = actor ? `[작업자 ${actor}] ${input.message}` : input.message;
  const fd = new FormData();
  fd.append('user_id', input.userId);
  fd.append('room_no', input.roomNo);
  fd.append('message', body);
  fd.append('sender_side', 'pc');
  fd.append('client_request_id', (globalThis.crypto?.randomUUID?.() || `${Date.now()}`).toString());
  fd.append('client_device_id', 'front-ops');
  if (actor) fd.append('actor_name', actor);

  const r = await fetchEnvelope<{ message: ChatMessage }>(CHAT_SEND_URL, {
    method: 'POST',
    body: fd,
    timeoutMs: TIMEOUT_MS_CHAT_SEND
  });
  if (!r.ok) return { ok: false, error: r.message || r.error };
  const saved = unwrapChatSendEnvelopeData(r.data);
  if (!saved?.id) return { ok: false, error: 'ABNORMAL_SEND_RESPONSE' };
  return { ok: true, savedId: saved.id };
}

function formatTimeKST(iso: string) {
  try {
    return new Date(iso).toLocaleString('ko-KR', {
      timeZone: 'Asia/Seoul',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return iso;
  }
}

function formatShortClockKST(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString('ko-KR', {
      timeZone: 'Asia/Seoul',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return '';
  }
}

function CardHandlerMeta({ card }: { card: WorkCard }) {
  const lines: { key: string; text: string }[] = [];
  if (card.checkedBy) {
    lines.push({
      key: 'chk',
      text: `확인: ${card.checkedBy}${card.checkedAt ? ` · ${formatShortClockKST(card.checkedAt)}` : ''}`
    });
  }
  if (card.requestedBy) {
    lines.push({
      key: 'req',
      text: `추가 요청: ${card.requestedBy}${card.requestedAt ? ` · ${formatShortClockKST(card.requestedAt)}` : ''}`
    });
  }
  if (card.doneBy) {
    lines.push({
      key: 'done',
      text: `완료: ${card.doneBy}${card.doneAt ? ` · ${formatShortClockKST(card.doneAt)}` : ''}`
    });
  }
  if (lines.length === 0) return null;
  return (
    <div className="mt-2 space-y-0.5 border-t border-gray-100 pt-2 text-[11px] leading-snug text-gray-500">
      {lines.map((l) => (
        <div key={l.key}>{l.text}</div>
      ))}
    </div>
  );
}

function statusMeta(status: CardStatus) {
  if (status === 'done') return { label: '완료', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  if (status === 'checked') return { label: '확인', cls: 'bg-amber-50 text-amber-700 border-amber-200' };
  return { label: '신규', cls: 'bg-blue-50 text-blue-700 border-blue-200' };
}

function kindMeta(kind: WorkKind) {
  switch (kind) {
    case 'clean_done':
      return { dot: 'bg-emerald-500', pill: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
    case 'towel_request':
      return { dot: 'bg-cyan-500', pill: 'bg-cyan-50 text-cyan-700 border-cyan-200' };
    case 'water_request':
      return { dot: 'bg-sky-500', pill: 'bg-sky-50 text-sky-700 border-sky-200' };
    case 'smell_issue':
      return { dot: 'bg-rose-500', pill: 'bg-rose-50 text-rose-700 border-rose-200' };
    case 'maintenance_issue':
      return { dot: 'bg-violet-500', pill: 'bg-violet-50 text-violet-700 border-violet-200' };
    case 'photo_report':
      return { dot: 'bg-indigo-500', pill: 'bg-indigo-50 text-indigo-700 border-indigo-200' };
    default:
      return { dot: 'bg-gray-400', pill: 'bg-gray-50 text-gray-700 border-gray-200' };
  }
}

export default function FrontOpsPage() {
  const router = useRouter();
  const [workerName, setWorkerName] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [cards, setCards] = useState<WorkCard[]>([]);
  const [showDone, setShowDone] = useState(false);

  const [flash, setFlash] = useState<string | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cardsRef = useRef<WorkCard[]>([]);
  cardsRef.current = cards;
  const refreshRef = useRef<(reason?: string) => void>(() => {});
  const workerNameRef = useRef<string | null>(null);
  workerNameRef.current = workerName;

  useEffect(() => {
    runSessionMigration();
    const u = loadUser();
    if (!u) {
      router.replace('/login');
      return;
    }
    setWorkerName(u.name);
    setAuthReady(true);
  }, [router]);

  useEffect(() => {
    if (!flash) return;
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setFlash(null), 2200);
    return () => {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      flashTimerRef.current = null;
    };
  }, [flash]);

  const sendUserId = resolveFrontOpsSendUserId();
  const canSendChat = Boolean(sendUserId);
  const missingSendEnvMsg = '전송에 실패했습니다. 관리자 설정이 필요합니다.';

  const refresh = useCallback(async (reason: string = 'unknown') => {
    setLoading(true);
    setError('');
    try {
      const msgs = await loadMessages();
      // 최신순 카드 추출: 최근 100건에서 각 메시지 1장 카드
      const sorted = [...msgs].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      const now = Date.now();

      const map = loadCardStateMap();

      // 중복 방지: 같은 room_no + kind가 이미 있고(done 제외)면 기존 카드 유지
      const prevActiveByRoomKind = new Map<string, WorkCard>();
      for (const c of cardsRef.current) {
        if (c.status === 'done') continue;
        const k = `${normalizeRoomNo(c.roomNo) || 'none'}:${c.kind}`;
        if (!prevActiveByRoomKind.has(k)) prevActiveByRoomKind.set(k, c);
      }

      const included = new Set<string>();
      const nextCards: WorkCard[] = [];
      for (const m of sorted) {
        if (!m?.id) continue;
        if (m.is_deleted) continue;
        // 청소팀(모바일) 메시지만 카드화 (프론트 pc는 제외)
        if (m.sender_side !== 'mobile') continue;
        // 최근 MOBILE_WINDOW_MS 이내만 카드화
        const createdMs = new Date(String(m.created_at || '')).getTime();
        if (!Number.isFinite(createdMs) || now - createdMs > MOBILE_WINDOW_MS) continue;
        // 시스템 유지보수 메시지(🔧 ... 접수됨)는 카드에서 제외
        if (m.message_type === 'maintenance' && /^🔧/.test(String(m.message || '').trim())) continue;

        const roomFromField = normalizeRoomNo(m.room_no);
        const roomFromText = roomFromField ? null : extractRoomFromText(String(m.message || ''));
        const room = roomFromField || roomFromText;
        const { kind, label } = parseWorkKind(m);
        const roomKindKey = `${normalizeRoomNo(room) || 'none'}:${kind}`;
        const prev = prevActiveByRoomKind.get(roomKindKey);
        if (prev && prev.status !== 'done') {
          if (!included.has(prev.key)) {
            included.add(prev.key);
            nextCards.push(prev);
          }
          continue;
        }
        const key = String(m.id);
        const persisted = map[key];
        const stateFields = workCardFieldsFromState(persisted ?? null);

        // 같은 room+kind가 이미 있고 아직 done이 아니면 신규 생성 금지 (최신순 루프이므로 첫 카드가 “최신”)
        if (nextCards.some((c) => `${normalizeRoomNo(c.roomNo) || 'none'}:${c.kind}` === roomKindKey && c.status !== 'done')) {
          continue;
        }

        nextCards.push({
          key,
          messageId: String(m.id),
          roomNo: room,
          label,
          kind,
          originalText: String(m.message || '').trim() || (m.message_type === 'image' ? '(이미지)' : '(내용 없음)'),
          createdAt: String(m.created_at || ''),
          ...stateFields
        });
      }
      // 최신순 유지 (단, “기존 카드 유지”된 오래된 카드도 리스트에 포함될 수 있음)
      nextCards.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      setCards(nextCards);
    } catch (e: any) {
      const message = e?.message || String(e);
      setError(message);
      console.error('[FRONT_OPS_REFRESH_FAILED]', { reason, message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshRef.current = (r?: string) => {
      void refresh(r ?? 'unknown');
    };
  }, [refresh]);

  useEffect(() => {
    if (!authReady || !workerNameRef.current) return;
    void refreshRef.current('mount');
  }, [authReady, workerName]);

  useEffect(() => {
    const onVisible = () => {
      if (!workerNameRef.current) return;
      if (document.visibilityState !== 'visible') return;
      refreshRef.current('visibility');
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (!workerNameRef.current) return;
      if (e.persisted) refreshRef.current('pageshow');
    };
    window.addEventListener('pageshow', onPageShow);
    return () => {
      window.removeEventListener('pageshow', onPageShow);
    };
  }, []);

  useEffect(() => {
    let lastRefreshAt = 0;
    const FOCUS_REFRESH_MIN_MS = 120_000;
    const onFocus = () => {
      if (!workerNameRef.current) return;
      const now = Date.now();
      if (now - lastRefreshAt < FOCUS_REFRESH_MIN_MS) return;
      lastRefreshAt = now;
      refreshRef.current('focus');
    };
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  const summary = useMemo(() => {
    const total = cards.length;
    const need = cards.filter((c) => c.status !== 'done').length;
    const done = cards.filter((c) => c.status === 'done').length;
    return { total, need, done };
  }, [cards]);

  const visibleCards = useMemo(() => (showDone ? cards : cards.filter((c) => c.status !== 'done')), [cards, showDone]);

  const mergeCardPersist = useCallback((cardKey: string, patch: Partial<FrontOpsCardState> & Pick<FrontOpsCardState, 'status'>) => {
    const raw = loadCardStateMap();
    const base: FrontOpsCardState = raw[cardKey] ? { ...raw[cardKey] } : { status: 'new' };
    const merged: FrontOpsCardState = { ...base, ...patch };
    saveCardStateMap({ ...raw, [cardKey]: merged });
    setCards((prev) => prev.map((c) => (c.key === cardKey ? { ...c, ...merged } : c)));
  }, []);

  const act = useCallback(
    async (card: WorkCard, action: 'check' | 'more' | 'done') => {
      const who = loadUser()?.name?.trim() || workerName;
      if (!who) return;
      const uid = resolveFrontOpsSendUserId();
      if (!uid) {
        setFlash(missingSendEnvMsg);
        return;
      }
      const room = normalizeRoomNo(card.roomNo);
      if (!room) {
        setFlash('방 번호를 찾을 수 없습니다');
        return;
      }
      const msg =
        action === 'check'
          ? `${room}호 확인했습니다`
          : action === 'more'
            ? `${room}호 추가 확인 부탁드립니다`
            : `${room}호 처리 완료로 확인했습니다`;

      setLoading(true);
      setError('');
      try {
        const r = await sendFrontMessage({
          userId: uid,
          roomNo: room,
          message: msg,
          actorName: who
        });
        if (!r.ok) {
          setError(missingSendEnvMsg);
          console.error('[FRONT_OPS_SEND_FAILED]', { action, room, error: r.error });
          return;
        }
        setFlash(`✅ ${msg}`);
        const at = new Date().toISOString();
        if (action === 'check') {
          mergeCardPersist(card.key, { status: 'checked', checkedBy: who, checkedAt: at });
        } else if (action === 'more') {
          mergeCardPersist(card.key, { status: 'checked', requestedBy: who, requestedAt: at });
        } else {
          mergeCardPersist(card.key, { status: 'done', doneBy: who, doneAt: at });
        }
      } finally {
        setLoading(false);
      }
    },
    [workerName, mergeCardPersist]
  );

  if (!authReady) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-sm text-gray-500">불러오는 중…</div>
      </main>
    );
  }

  if (!workerName) {
    return null;
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-5xl px-4 pb-10 pt-6">
        <div className="mb-3 flex flex-col gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="text-gray-800">
            <span className="text-gray-500">작업자</span>{' '}
            <span className="font-bold text-gray-900">{workerName}</span>
            <span className="ml-2 text-xs text-gray-400">(앱 로그인과 동일)</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => router.push('/chat')}
              className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-800"
            >
              채팅으로
            </button>
            <button
              type="button"
              onClick={() => logoutAndGoLogin(router)}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700"
            >
              로그아웃
            </button>
          </div>
        </div>

        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-lg font-extrabold text-gray-900">Front Ops</div>
            <div className="text-xs text-gray-500">청소팀 ↔ 프론트 협업</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowDone((v) => !v)}
              className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 shadow-sm"
            >
              {showDone ? '완료 숨기기' : `완료 보기 (${summary.done})`}
            </button>
            <button
              type="button"
              onClick={() => void refresh('manual')}
              disabled={loading}
              className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 shadow-sm disabled:opacity-50"
            >
              새로고침
            </button>
          </div>
        </div>

        {!canSendChat && (
          <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
            <div className="font-bold">전송 비활성</div>
            <div className="mt-1 text-xs">전송에 실패했습니다. 관리자 설정이 필요합니다.</div>
          </div>
        )}

        {flash && (
          <div className="mb-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800">
            {flash}
          </div>
        )}

        {error && (
          <div className="mb-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-800">
            {error}
          </div>
        )}

        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
            <div className="text-xs text-gray-500">전체 카드 수</div>
            <div className="mt-1 text-2xl font-extrabold text-gray-900">{summary.total}</div>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
            <div className="text-xs text-gray-500">확인 필요</div>
            <div className="mt-1 text-2xl font-extrabold text-gray-900">{summary.need}</div>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
            <div className="text-xs text-gray-500">완료 처리</div>
            <div className="mt-1 text-2xl font-extrabold text-gray-900">{summary.done}</div>
          </div>
        </div>

        <div className="space-y-3">
          {visibleCards.map((c) => {
            const st = statusMeta(c.status);
            const km = kindMeta(c.kind);
            const roomLabel = c.roomNo ? `${c.roomNo}호` : '방 미확인';
            return (
              <div key={c.key} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${km.dot}`} />
                      <div className="text-base font-extrabold text-gray-900">{roomLabel}</div>
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${km.pill}`}>{c.label}</span>
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${st.cls}`}>{st.label}</span>
                      <span className="ml-auto text-[11px] text-gray-400">{formatTimeKST(c.createdAt)}</span>
                    </div>
                    <div className="mt-2 whitespace-pre-wrap break-words text-sm text-gray-700">{c.originalText}</div>
                    <CardHandlerMeta card={c} />
                  </div>

                  <div className="grid grid-cols-3 gap-2 sm:w-[360px]">
                    <button
                      type="button"
                      disabled={!canSendChat || loading}
                      onClick={() => void act(c, 'check')}
                      className="h-12 rounded-xl border border-gray-200 bg-gray-50 text-sm font-extrabold text-gray-900 disabled:opacity-50"
                    >
                      확인
                    </button>
                    <button
                      type="button"
                      disabled={!canSendChat || loading}
                      onClick={() => void act(c, 'more')}
                      className="h-12 rounded-xl border border-gray-200 bg-white text-sm font-extrabold text-gray-900 disabled:opacity-50"
                    >
                      추가 요청
                    </button>
                    <button
                      type="button"
                      disabled={!canSendChat || loading}
                      onClick={() => void act(c, 'done')}
                      className="h-12 rounded-xl bg-gray-900 text-sm font-extrabold text-white disabled:opacity-50"
                    >
                      완료 처리
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {visibleCards.length === 0 && (
            <div className="rounded-2xl border border-gray-200 bg-white px-4 py-6 text-center text-sm text-gray-500">
              카드가 없습니다. (최근 100개 메시지 기준)
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

