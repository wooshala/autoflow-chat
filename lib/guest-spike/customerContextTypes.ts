// Phase 2A — Customer Information panel contract. The panel manages a SMALL, SESSION-SCOPED
// operational memo (staff-edited), NOT a reservation. The `session` block is read-only (room /
// status / start / language, from the guest session). The `customer` block is the editable memo
// (name / phone / checkout date / vehicle / memo); it is null when there is no OPEN session, and
// all-empty defaults for an open session with nothing saved yet. No reservation / PII estimation.

export interface GuestCustomerContext {
  session: {
    channelKey: string;
    status: 'open' | 'none';
    roomNo: string | null;
    startedAt: string | null;
    languageCode: string | null;
  };
  /** Editable, session-scoped memo. null when no open session (nothing to edit). */
  customer: {
    guestName: string;
    guestPhone: string;
    /** YYYY-MM-DD or null. */
    checkOutDate: string | null;
    vehicleNo: string;
    memo: string;
    updatedAt: string | null;
    updatedBy: string | null;
  } | null;
}

export interface GuestCustomerContextResponse {
  ok: true;
  context: GuestCustomerContext;
}
