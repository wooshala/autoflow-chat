// Phase 1.1 채팅방 목록 표시용 순수 포맷터(서버/클라 공용, DB·supabase 의존 없음 → 단위 테스트 가능).

import type { ChatRoomSummary } from '@/lib/types';

/** 최근 메시지 preview 규칙: 삭제 > 사진 > 텍스트 한 줄 > 메시지 없음. */
export function messagePreview(m: {
  is_deleted?: boolean | null;
  message_type?: string | null;
  message?: string | null;
}): string {
  if (m.is_deleted) return '삭제된 메시지';
  if (m.message_type === 'image') return '사진';
  const text = String(m.message ?? '').trim();
  return text || '메시지 없음';
}

const KST = 'Asia/Seoul';
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** KST 기준 {year, month, day, hour, minute, weekday(0=일)} */
function kstFields(ms: number): { y: number; mo: number; d: number; h: number; mi: number; wd: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: KST,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short'
  }).formatToParts(new Date(ms));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const wdMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    y: Number(get('year')),
    mo: Number(get('month')),
    d: Number(get('day')),
    h: Number(get('hour') === '24' ? '0' : get('hour')),
    mi: Number(get('minute')),
    wd: wdMap[get('weekday')] ?? 0
  };
}

/** KST 자정 기준 일련일 번호(달력 일수 비교용). */
function kstEpochDay(f: { y: number; mo: number; d: number }): number {
  return Math.floor(Date.UTC(f.y, f.mo - 1, f.d) / 86400000);
}

/**
 * 채팅방 목록 시간 표시 규칙(KST):
 *  오늘 → HH:mm / 어제 → '어제' / 최근 7일(2~6일 전) → 요일 / 그 이전 → M/D
 */
export function formatChatRoomTime(iso: string, nowMs?: number): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const now = typeof nowMs === 'number' ? nowMs : Date.now();

  const msg = kstFields(t);
  const cur = kstFields(now);
  const diffDays = kstEpochDay(cur) - kstEpochDay(msg);

  if (diffDays <= 0) {
    return `${String(msg.h).padStart(2, '0')}:${String(msg.mi).padStart(2, '0')}`;
  }
  if (diffDays === 1) return '어제';
  if (diffDays <= 6) return `${WEEKDAYS[msg.wd]}요일`;
  return `${msg.mo}/${msg.d}`;
}

/**
 * Phase 1.2.6 정렬 계약(초기 로드와 Realtime patch 후 재정렬이 동일 comparator를 공유해야 함).
 *   1. last_message.created_at DESC (최신 먼저)
 *   2. last_message 없음/무효 시각 → 항상 뒤 (nulls last)
 *   3. 동일 시각 또는 둘 다 없음 → name ASC (ko)
 *   4. 최종 tie-breaker → id ASC
 * 무효 timestamp에도 NaN으로 무너지지 않는다(무효는 null과 동일 후순위 그룹).
 */
function lastMessageTime(s: ChatRoomSummary): number | null {
  const iso = s.last_message?.created_at;
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

export function compareChatRoomSummaries(a: ChatRoomSummary, b: ChatRoomSummary): number {
  const ta = lastMessageTime(a);
  const tb = lastMessageTime(b);
  if (ta !== null && tb !== null) {
    if (ta !== tb) return tb - ta; // DESC
  } else if (ta !== null) {
    return -1; // a는 메시지 있음 → 앞
  } else if (tb !== null) {
    return 1; // b는 메시지 있음 → 앞
  }
  // 동일 시각 또는 둘 다 null/무효 → 이름 → id
  const nameCmp = String(a.name ?? '').localeCompare(String(b.name ?? ''), 'ko');
  if (nameCmp !== 0) return nameCmp;
  return String(a.id ?? '').localeCompare(String(b.id ?? ''));
}

/** comparator로 정렬한 새 배열 반환(입력 불변). 서버/클라 공용. */
export function sortChatRoomSummaries(list: ChatRoomSummary[]): ChatRoomSummary[] {
  return [...list].sort(compareChatRoomSummaries);
}
