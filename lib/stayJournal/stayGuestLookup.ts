import { getStayJournalAdmin, isStayJournalConfigured } from '@/lib/stayJournal/client';
import {
  classifyGuestMatch,
  normName,
  type CustomerRow,
  type LostFoundMatchResult,
  type ShadowGuestRow
} from '@/lib/stayJournal/guestMatchCore';

/** UI DTO for Event Center (Phase 1 — dynamic match, no DB snapshot). */
export type GuestMatchViewStatus = 'exact' | 'multiple' | 'none' | 'unavailable';

export type GuestMatchView = {
  status: GuestMatchViewStatus;
  stars: 1 | 2 | 3 | 4 | 5 | null;
  starsDisplay: string;
  label: string;
  segmentLabel: '숙박' | '대실' | null;
  guest_name: string | null;
  phone: string | null;
  stay_date: string | null;
  check_in: string | null;
  check_out: string | null;
  reservation_source: string | null;
  candidates: Array<{
    guest_name: string;
    stay_date: string | null;
    segmentLabel: '숙박' | '대실' | null;
    phone: string | null;
    check_in: string | null;
    check_out: string | null;
    reservation_source: string | null;
  }>;
};

function kstDate(at: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(at);
}

function kstDateMinusDays(at: Date, days: number): string {
  return kstDate(new Date(at.getTime() - days * 24 * 60 * 60 * 1000));
}

function segmentLabel(segment: string | null | undefined): '숙박' | '대실' | null {
  const s = String(segment || '').toLowerCase();
  if (s === 'stay' || s === '숙박') return '숙박';
  if (s === 'dayuse' || s === 'day_use' || s === '대실') return '대실';
  return null;
}

function starsDisplay(n: 1 | 2 | 3 | 4 | 5 | null): string {
  if (!n) return '';
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}

/** Map core result → Event Center confidence stars. */
export function toGuestMatchView(result: LostFoundMatchResult): GuestMatchView {
  const distinctNames = [
    ...new Set(result.match_candidates.map((c) => normName(c.guest_name)).filter(Boolean))
  ];

  if (distinctNames.length > 1) {
    return {
      status: 'multiple',
      stars: 2,
      starsDisplay: starsDisplay(2),
      label: '확인 필요',
      segmentLabel: null,
      guest_name: null,
      phone: null,
      stay_date: null,
      check_in: null,
      check_out: null,
      reservation_source: null,
      candidates: result.match_candidates.map((c) => ({
        guest_name: c.guest_name,
        stay_date: c.stay_date,
        segmentLabel: segmentLabel(c.segment),
        phone: null,
        check_in: c.check_in,
        check_out: c.check_out,
        reservation_source: c.reservation_source
      }))
    };
  }

  if (result.match_confidence === 'no_guest_name' || result.status === 'unmatched') {
    return {
      status: 'none',
      stars: 1,
      starsDisplay: starsDisplay(1),
      label: '숙박일지 매칭 없음',
      segmentLabel: null,
      guest_name: null,
      phone: null,
      stay_date: null,
      check_in: null,
      check_out: null,
      reservation_source: null,
      candidates: []
    };
  }

  if (result.match_confidence === 'exact_name_single') {
    return {
      status: 'exact',
      stars: 5,
      starsDisplay: starsDisplay(5),
      label: '거의 확실',
      segmentLabel: segmentLabel(result.segment),
      guest_name: result.matched_guest_name,
      phone: result.matched_guest_phone,
      stay_date: result.stay_date,
      check_in: result.check_in,
      check_out: result.check_out,
      reservation_source: result.reservation_source,
      candidates: []
    };
  }

  // exact name, no/ambiguous phone
  return {
    status: 'exact',
    stars: 4,
    starsDisplay: starsDisplay(4),
    label: result.match_confidence === 'exact_name_multiple' ? '이름 일치 · 전화 확인' : '이름 일치',
    segmentLabel: segmentLabel(result.segment),
    guest_name: result.matched_guest_name,
    phone: result.matched_guest_phone,
    stay_date: result.stay_date,
    check_in: result.check_in,
    check_out: result.check_out,
    reservation_source: result.reservation_source,
    candidates: []
  };
}

export function unavailableGuestMatch(reason = '숙박일지 연결 안 됨'): GuestMatchView {
  return {
    status: 'unavailable',
    stars: null,
    starsDisplay: '',
    label: reason,
    segmentLabel: null,
    guest_name: null,
    phone: null,
    stay_date: null,
    check_in: null,
    check_out: null,
    reservation_source: null,
    candidates: []
  };
}

/**
 * room_no + found_at → stay-journal match (ledger_entries_shadow).
 * Window: discovery day (KST) + previous day. Includes dayuse + stay.
 */
export async function matchLostFoundGuest(input: {
  room_no: string;
  found_at: string;
}): Promise<LostFoundMatchResult> {
  const admin = getStayJournalAdmin();
  if (!admin) {
    throw new Error('Stay journal not configured');
  }

  const at = new Date(input.found_at);
  const today = kstDate(at);
  const yesterday = kstDateMinusDays(at, 1);

  const { data, error } = await admin
    .from('ledger_entries_shadow')
    .select('date, segment, room_no, guest_name, check_in, check_out, raw')
    .eq('room_no', input.room_no)
    .in('date', [today, yesterday])
    .order('date', { ascending: false });

  if (error) throw error;

  const rows: ShadowGuestRow[] = (data ?? []).map((r) => {
    const raw = (r.raw ?? {}) as Record<string, unknown>;
    const source =
      typeof raw.reservation_source === 'string'
        ? (raw.reservation_source as string)
        : typeof raw.source === 'string'
          ? (raw.source as string)
          : null;
    return {
      date: String(r.date ?? ''),
      segment: (r.segment as string | null) ?? null,
      room_no: (r.room_no as string | null) ?? null,
      guest_name: (r.guest_name as string | null) ?? null,
      reservation_source: source,
      check_in: (r.check_in as string | null) ?? null,
      check_out: (r.check_out as string | null) ?? null
    };
  });

  const named = rows.filter((r) => normName(r.guest_name) !== '');
  const distinctNames = [...new Set(named.map((r) => normName(r.guest_name)))];
  let customers: CustomerRow[] = [];
  if (distinctNames.length === 1 && named[0]?.guest_name) {
    const exactName = named[0].guest_name.trim();
    const { data: custData, error: custErr } = await admin
      .from('customers')
      .select('name, phone_normalized')
      .eq('name', exactName);
    if (custErr) throw custErr;
    customers = (custData ?? []) as CustomerRow[];
  }

  return classifyGuestMatch(rows, customers);
}

export async function lookupGuestMatchForItem(input: {
  room_no: string | null | undefined;
  found_at: string | null | undefined;
}): Promise<GuestMatchView> {
  if (!isStayJournalConfigured()) {
    return unavailableGuestMatch('숙박일지 연결 안 됨');
  }
  const room = String(input.room_no || '').trim();
  const foundAt = String(input.found_at || '').trim();
  if (!room || !foundAt) {
    return {
      status: 'none',
      stars: 1,
      starsDisplay: starsDisplay(1),
      label: '숙박일지 매칭 없음',
      segmentLabel: null,
      guest_name: null,
      phone: null,
      stay_date: null,
      check_in: null,
      check_out: null,
      reservation_source: null,
      candidates: []
    };
  }

  try {
    const result = await matchLostFoundGuest({ room_no: room, found_at: foundAt });
    return toGuestMatchView(result);
  } catch {
    return unavailableGuestMatch('숙박일지 조회 실패');
  }
}
