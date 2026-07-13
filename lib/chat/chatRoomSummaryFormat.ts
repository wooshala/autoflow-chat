// Phase 1.1 채팅방 목록 표시용 순수 포맷터(서버/클라 공용, DB·supabase 의존 없음 → 단위 테스트 가능).

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
