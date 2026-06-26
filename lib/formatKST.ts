const KST: Intl.DateTimeFormatOptions = { timeZone: 'Asia/Seoul' };

function parts(date: string | Date) {
  return new Intl.DateTimeFormat('ko-KR', {
    ...KST,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date(date));
}

function get(ps: Intl.DateTimeFormatPart[], type: string) {
  return ps.find((p) => p.type === type)?.value ?? '';
}

/** 2026-05-15 18:35:09 */
export function formatKST(date: string | Date): string {
  try {
    const ps = parts(date);
    return `${get(ps, 'year')}-${get(ps, 'month')}-${get(ps, 'day')} ${get(ps, 'hour')}:${get(ps, 'minute')}:${get(ps, 'second')}`;
  } catch {
    return String(date);
  }
}

/** 05/15 18:35  (compact — no year, no seconds) */
export function formatKSTShort(date: string | Date): string {
  try {
    const ps = parts(date);
    return `${get(ps, 'month')}/${get(ps, 'day')} ${get(ps, 'hour')}:${get(ps, 'minute')}`;
  } catch {
    return String(date);
  }
}

/** 18:35  (time only) */
export function formatKSTTime(date: string | Date): string {
  try {
    const ps = parts(date);
    return `${get(ps, 'hour')}:${get(ps, 'minute')}`;
  } catch {
    return String(date);
  }
}

function kstDayStamp(date: string | Date): string {
  const ps = parts(date);
  return `${get(ps, 'year')}-${get(ps, 'month')}-${get(ps, 'day')}`;
}

/**
 * Human-friendly "last seen" for operators: 방금 전 / N분 전 / N시간 전 /
 * 오늘 HH:MM / 어제 HH:MM / MM/DD HH:MM. Never shows raw timestamps.
 */
export function formatRelativeKST(date: string | Date | null | undefined): string {
  if (!date) return '접속 기록 없음';
  try {
    const t = new Date(date).getTime();
    if (!Number.isFinite(t)) return '접속 기록 없음';
    const now = Date.now();
    const diff = now - t;
    if (diff < 0) return '방금 전';
    const min = Math.floor(diff / 60000);
    if (min < 1) return '방금 전';
    if (min < 60) return `${min}분 전`;
    const hr = Math.floor(min / 60);
    if (hr < 6) return `${hr}시간 전`;
    const today = kstDayStamp(new Date(now));
    const day = kstDayStamp(date);
    if (day === today) return `오늘 ${formatKSTTime(date)}`;
    const yesterday = kstDayStamp(new Date(now - 24 * 60 * 60 * 1000));
    if (day === yesterday) return `어제 ${formatKSTTime(date)}`;
    return formatKSTShort(date);
  } catch {
    return '접속 기록 없음';
  }
}
