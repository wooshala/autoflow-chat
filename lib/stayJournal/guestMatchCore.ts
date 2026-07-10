/**
 * Lost & Found guest match — occupancy timeline + proximity to found_at.
 * Goal: find the prior guest of the room (not "yesterday stay" / "today guest" heuristics).
 * Prefer: wrong match 방지 > 자동 확정
 */

export type MatchConfidence =
  | 'prior_guest_strong'
  | 'prior_guest'
  | 'ambiguous'
  | 'no_guest_name'
  | 'no_candidate';

export type ShadowGuestRow = {
  date: string;
  segment: string | null;
  room_no: string | null;
  guest_name: string | null;
  reservation_source: string | null;
  check_in: string | null;
  check_out: string | null;
};

export type CustomerRow = {
  name: string | null;
  phone_normalized: string | null;
};

export type GuestCandidate = {
  guest_name: string;
  stay_date: string | null;
  segment: string | null;
  reservation_source: string | null;
  check_in: string | null;
  check_out: string | null;
  score?: number;
  reason?: string | null;
};

export type LostFoundMatchResult = {
  status: 'matched' | 'unmatched';
  matched_guest_name: string | null;
  matched_guest_phone: string | null;
  match_confidence: MatchConfidence | null;
  match_candidates: GuestCandidate[];
  stay_date: string | null;
  reservation_source: string | null;
  segment: string | null;
  check_in: string | null;
  check_out: string | null;
  match_reason?: string | null;
};

/** Exact if #1 beats #2 by at least this score gap. */
export const EXACT_SCORE_GAP = 22;
/** Minimum score for a sole / leading candidate to be exact. */
export const EXACT_MIN_SCORE = 38;

export function normName(v: string | null | undefined): string {
  return (v ?? '').replace(/\s+/g, '').trim();
}

function isStay(segment: string | null | undefined): boolean {
  const s = String(segment || '').toLowerCase();
  return s === 'stay' || s === '숙박';
}

function isDayuse(segment: string | null | undefined): boolean {
  const s = String(segment || '').toLowerCase();
  return s === 'dayuse' || s === 'day_use' || s === '대실';
}

/**
 * Parse informal KR time strings → minutes from midnight.
 * Supports: 16:45, 5시, 18시반, 12, 9, 오후 5시, 새벽 5시
 */
export function parseClockToMinutes(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s || s === '-' || /차안|x|없음/i.test(s)) return null;

  const afternoon = /오후|저녁|밤/.test(s);
  const dawn = /새벽|오전/.test(s) && !afternoon;
  s = s.replace(/(오후|오전|저녁|밤|새벽)/g, '').trim();

  const hm = s.match(/^(\d{1,2})\s*[:：]\s*(\d{1,2})$/);
  if (hm) {
    let h = Number(hm[1]);
    const m = Number(hm[2]);
    if (afternoon && h < 12) h += 12;
    if (h >= 0 && h < 24 && m >= 0 && m < 60) return h * 60 + m;
    return null;
  }

  const half = s.match(/^(\d{1,2})\s*시\s*반$/);
  if (half) {
    let h = Number(half[1]);
    if (afternoon && h < 12) h += 12;
    if (dawn && h === 12) h = 0;
    if (h >= 0 && h < 24) return h * 60 + 30;
    return null;
  }

  const range = s.match(/^(\d{1,2})\s*[-~∼]\s*(\d{1,2})\s*시?/);
  if (range) {
    // "6-7시" → use first hour as check_out approx
    let h = Number(range[1]);
    if (afternoon && h < 12) h += 12;
    if (h >= 0 && h < 24) return h * 60;
    return null;
  }

  const si = s.match(/^(\d{1,2})\s*시$/);
  if (si) {
    let h = Number(si[1]);
    if (afternoon && h < 12) h += 12;
    if (dawn && h === 12) h = 0;
    if (h >= 0 && h < 24) return h * 60;
    return null;
  }

  if (/^\d{1,2}$/.test(s)) {
    let h = Number(s);
    if (h > 23) return null;
    if (afternoon && h < 12) h += 12;
    return h * 60;
  }

  return null;
}

function parseYmd(date: string): { y: number; m: number; d: number } | null {
  const m = String(date).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

/** Local wall-clock Date for Asia/Seoul calendar day + minutes (no TZ shift tricks). */
export function kstWallDate(dateYmd: string, minutes: number): Date | null {
  const p = parseYmd(dateYmd);
  if (!p) return null;
  const h = Math.floor(minutes / 60);
  const mi = minutes % 60;
  // Encode as UTC pretending KST wall clock so diffs are correct in absolute ms
  return new Date(Date.UTC(p.y, p.m - 1, p.d, h, mi, 0));
}

function addDaysYmd(dateYmd: string, days: number): string | null {
  const p = parseYmd(dateYmd);
  if (!p) return null;
  const dt = new Date(Date.UTC(p.y, p.m - 1, p.d + days));
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export type Occupancy = {
  start: Date;
  end: Date;
  timeConfidence: 'high' | 'low';
  segmentKind: 'stay' | 'dayuse' | 'unknown';
};

/**
 * Build occupancy interval from a ledger shadow row.
 * stay: start=date+in, end=(date+1)+out
 * dayuse: start=date+in, end=date+out
 */
export function buildOccupancy(row: ShadowGuestRow): Occupancy | null {
  if (!row.date) return null;
  const stay = isStay(row.segment);
  const dayuse = isDayuse(row.segment);
  const kind: Occupancy['segmentKind'] = stay ? 'stay' : dayuse ? 'dayuse' : 'unknown';

  const inMin = parseClockToMinutes(row.check_in);
  const outMin = parseClockToMinutes(row.check_out);

  let timeConfidence: Occupancy['timeConfidence'] = 'high';
  let startMin: number;
  let endMin: number;
  let endDate = row.date;

  if (stay || (!dayuse && kind === 'unknown')) {
    startMin = inMin ?? 15 * 60; // default 15:00
    endMin = outMin ?? 11 * 60; // default next-day 11:00
    endDate = addDaysYmd(row.date, 1) || row.date;
    if (inMin == null || outMin == null) timeConfidence = 'low';
  } else {
    startMin = inMin ?? 12 * 60;
    endMin = outMin ?? startMin + 4 * 60;
    if (endMin <= startMin) endMin = startMin + 4 * 60;
    if (inMin == null || outMin == null) timeConfidence = 'low';
  }

  const start = kstWallDate(row.date, startMin);
  const end = kstWallDate(endDate, endMin);
  if (!start || !end) return null;
  if (end.getTime() <= start.getTime()) {
    // fallback: push end +4h
    end.setUTCHours(end.getUTCHours() + 4);
  }
  return { start, end, timeConfidence, segmentKind: kind === 'unknown' ? (stay ? 'stay' : 'dayuse') : kind };
}

/** found_at ISO → comparable wall clock in same encoding as kstWallDate. */
export function foundAtWall(foundAtIso: string): Date | null {
  const d = new Date(foundAtIso);
  if (Number.isNaN(d.getTime())) return null;
  // Convert instant → KST wall components, then encode as UTC wall (same as occupancy)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || '';
  const ymd = `${get('year')}-${get('month')}-${get('day')}`;
  const minutes = Number(get('hour')) * 60 + Number(get('minute'));
  return kstWallDate(ymd, minutes);
}

function hoursBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / (1000 * 60 * 60);
}

function proximityScore(hoursAfterEnd: number): number {
  // 0h → 100, ~6h → ~37, ~12h → ~14, 24h → ~2, 48h+ → ~0
  if (hoursAfterEnd < 0) return 0;
  return 100 * Math.exp(-hoursAfterEnd / 6);
}

function inOccupancyScore(hoursSinceStart: number): number {
  // Slightly below a freshly departed guest (~1h departed ≈ 85)
  const base = 72;
  return Math.max(20, base * Math.exp(-Math.max(0, hoursSinceStart) / 14));
}

function reasonFor(c: {
  segmentKind: Occupancy['segmentKind'];
  phase: 'departed' | 'in_occupancy';
  timeConfidence: 'high' | 'low';
  stayDate: string | null;
  foundYmd: string;
}): string {
  const bits: string[] = [];
  if (c.phase === 'in_occupancy') {
    bits.push('점유 중 발견');
  } else if (c.segmentKind === 'stay' && c.stayDate && c.stayDate < c.foundYmd) {
    bits.push('전날 숙박 · 퇴실 후 청소 가능');
  } else if (c.segmentKind === 'dayuse') {
    bits.push('당일 대실 · 퇴실 후');
  } else {
    bits.push('직전 이용 · 퇴실 후');
  }
  if (c.timeConfidence === 'low') bits.push('시간 확인 필요');
  return bits.join(' · ');
}

export type ScoredRow = GuestCandidate & {
  score: number;
  reason: string;
  phase: 'departed' | 'in_occupancy';
};

export function scorePriorGuests(
  shadowRows: ShadowGuestRow[],
  foundAtIso: string
): ScoredRow[] {
  const found = foundAtWall(foundAtIso);
  if (!found) return [];

  const foundYmd = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date(foundAtIso));

  const scored: ScoredRow[] = [];

  for (const row of shadowRows) {
    const name = (row.guest_name ?? '').trim();
    if (!normName(name)) continue;

    const occ = buildOccupancy(row);
    if (!occ) continue;

    // Exclude anyone who checked in after discovery
    if (occ.start.getTime() > found.getTime()) continue;

    let score = 0;
    let phase: 'departed' | 'in_occupancy';

    if (found.getTime() < occ.end.getTime()) {
      phase = 'in_occupancy';
      score = inOccupancyScore(hoursBetween(occ.start, found));
    } else {
      phase = 'departed';
      score = proximityScore(hoursBetween(occ.end, found));
    }

    if (occ.timeConfidence === 'low') score -= 15;
    if (name) score += 5;

    const segmentKind = occ.segmentKind;
    const rsn = reasonFor({
      segmentKind,
      phase,
      timeConfidence: occ.timeConfidence,
      stayDate: row.date,
      foundYmd
    });

    scored.push({
      guest_name: name,
      stay_date: row.date ?? null,
      segment: row.segment ?? null,
      reservation_source: row.reservation_source ?? null,
      check_in: row.check_in ?? null,
      check_out: row.check_out ?? null,
      score: Math.round(score * 10) / 10,
      reason: rsn,
      phase
    });
  }

  scored.sort((a, b) => b.score - a.score || a.guest_name.localeCompare(b.guest_name, 'ko'));
  return scored;
}

function emptyUnmatched(confidence: MatchConfidence, candidates: GuestCandidate[]): LostFoundMatchResult {
  return {
    status: 'unmatched',
    matched_guest_name: null,
    matched_guest_phone: null,
    match_confidence: confidence,
    match_candidates: candidates,
    stay_date: null,
    reservation_source: null,
    segment: null,
    check_in: null,
    check_out: null,
    match_reason: null
  };
}

/**
 * Classify prior-guest candidates for found_at.
 * customersForWinner: optional phones for the winning name (exact only).
 */
export function classifyGuestMatch(
  shadowRows: ShadowGuestRow[],
  foundAtIso: string,
  customersForWinner: CustomerRow[] = []
): LostFoundMatchResult {
  const scored = scorePriorGuests(shadowRows, foundAtIso);
  const candidates: GuestCandidate[] = scored.map((s) => ({
    guest_name: s.guest_name,
    stay_date: s.stay_date,
    segment: s.segment,
    reservation_source: s.reservation_source,
    check_in: s.check_in,
    check_out: s.check_out,
    score: s.score,
    reason: s.reason
  }));

  if (scored.length === 0) {
    const anyNamed = shadowRows.some((r) => normName(r.guest_name));
    return emptyUnmatched(anyNamed ? 'no_candidate' : 'no_guest_name', candidates);
  }

  const top = scored[0]!;
  const second = scored[1];
  const gap = second ? top.score - second.score : 999;
  // Ambiguous only when 2+ independently plausible priors compete.
  const bothPlausible =
    Boolean(second) && top.score >= EXACT_MIN_SCORE && second!.score >= EXACT_MIN_SCORE;
  const ambiguous = Boolean(second && (gap < EXACT_SCORE_GAP || bothPlausible));

  if (ambiguous) {
    return {
      status: 'unmatched',
      matched_guest_name: null,
      matched_guest_phone: null,
      match_confidence: 'ambiguous',
      match_candidates: candidates.slice(0, 5),
      stay_date: null,
      reservation_source: null,
      segment: null,
      check_in: null,
      check_out: null,
      match_reason: '후보 복수 · 확인 필요'
    };
  }

  // Sole prior (or clear #1) → exact. Extremely weak scores → none.
  if (top.score < 8) {
    return emptyUnmatched('no_candidate', candidates);
  }

  const phones = customersForWinner
    .map((c) => (c.phone_normalized ?? '').trim())
    .filter((p) => p !== '');
  const strong = top.score >= 70 && top.phase === 'departed' && !/시간 확인 필요/.test(top.reason);

  return {
    status: 'matched',
    matched_guest_name: top.guest_name,
    matched_guest_phone: phones.length === 1 ? phones[0]! : null,
    match_confidence: strong && phones.length === 1 ? 'prior_guest_strong' : 'prior_guest',
    match_candidates: candidates.slice(0, 5),
    stay_date: top.stay_date,
    reservation_source: top.reservation_source,
    segment: top.segment,
    check_in: top.check_in,
    check_out: top.check_out,
    match_reason: top.reason
  };
}
