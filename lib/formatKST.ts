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
