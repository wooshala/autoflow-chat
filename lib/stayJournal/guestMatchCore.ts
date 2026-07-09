/**
 * Lost & Found guest match — pure classify logic (ported from univer-ops).
 * Prefer: wrong match 방지 > 자동 확정
 */

export type MatchConfidence =
  | 'exact_name_single'
  | 'exact_name_multiple'
  | 'no_customer_match'
  | 'no_guest_name';

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
};

export function normName(v: string | null | undefined): string {
  return (v ?? '').replace(/\s+/g, '').trim();
}

export function classifyGuestMatch(
  shadowRows: ShadowGuestRow[],
  customersForSingleName: CustomerRow[]
): LostFoundMatchResult {
  const named = shadowRows.filter((r) => normName(r.guest_name) !== '');
  const candidates: GuestCandidate[] = named.map((r) => ({
    guest_name: (r.guest_name ?? '').trim(),
    stay_date: r.date ?? null,
    segment: r.segment ?? null,
    reservation_source: r.reservation_source ?? null,
    check_in: r.check_in ?? null,
    check_out: r.check_out ?? null
  }));

  if (named.length === 0) {
    return {
      status: 'unmatched',
      matched_guest_name: null,
      matched_guest_phone: null,
      match_confidence: 'no_guest_name',
      match_candidates: candidates,
      stay_date: null,
      reservation_source: null,
      segment: null,
      check_in: null,
      check_out: null
    };
  }

  const distinctNames = [...new Set(named.map((r) => normName(r.guest_name)))];
  if (distinctNames.length > 1) {
    return {
      status: 'unmatched',
      matched_guest_name: null,
      matched_guest_phone: null,
      match_confidence: 'no_customer_match',
      match_candidates: candidates,
      stay_date: null,
      reservation_source: null,
      segment: null,
      check_in: null,
      check_out: null
    };
  }

  const single = named[0]!;
  const guestName = (single.guest_name ?? '').trim();
  const stayDate = single.date ?? null;
  const source = single.reservation_source ?? null;
  const segment = single.segment ?? null;
  const checkIn = single.check_in ?? null;
  const checkOut = single.check_out ?? null;

  const phones = customersForSingleName
    .map((c) => (c.phone_normalized ?? '').trim())
    .filter((p) => p !== '');

  if (customersForSingleName.length === 1 && phones.length === 1) {
    return {
      status: 'matched',
      matched_guest_name: guestName,
      matched_guest_phone: phones[0]!,
      match_confidence: 'exact_name_single',
      match_candidates: candidates,
      stay_date: stayDate,
      reservation_source: source,
      segment,
      check_in: checkIn,
      check_out: checkOut
    };
  }

  if (customersForSingleName.length > 1) {
    return {
      status: 'matched',
      matched_guest_name: guestName,
      matched_guest_phone: null,
      match_confidence: 'exact_name_multiple',
      match_candidates: candidates,
      stay_date: stayDate,
      reservation_source: source,
      segment,
      check_in: checkIn,
      check_out: checkOut
    };
  }

  return {
    status: 'matched',
    matched_guest_name: guestName,
    matched_guest_phone: null,
    match_confidence: 'no_customer_match',
    match_candidates: candidates,
    stay_date: stayDate,
    reservation_source: source,
    segment,
    check_in: checkIn,
    check_out: checkOut
  };
}
