// Phase 1I.1-B (option 2) — Customer Information panel contract (READ-ONLY, SESSION SKELETON).
//
// Phase 1I.1-C determined there is NO authoritative "current stay" source: the ledger carries only
// clock times (no dates), OTA rows have no room_no, and no projection is both fresh and room+date+
// status complete. So the panel intentionally shows NO derived reservation — no guest name, phone,
// proximity match, or "참고 예약". The reservation block is a single 'pending' placeholder until a
// first-class Reservation / CurrentStay entity is built. Only the SESSION block carries real data.

export interface GuestCustomerContext {
  session: {
    channelKey: string;
    status: 'open' | 'none';
    roomNo: string | null;
    startedAt: string | null;
    languageCode: string | null;
  };
  reservation: {
    // Always 'pending' — no authoritative reservation source exists yet (Phase 1I.1-C).
    // Never populated with a derived/guessed guest. This is a deliberate empty state.
    availability: 'pending';
  };
  sources: Array<{
    type: 'guest_session';
    label: string;
    updatedAt: string | null;
  }>;
}

export interface GuestCustomerContextResponse {
  ok: true;
  context: GuestCustomerContext;
}
