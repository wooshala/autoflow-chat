// Phase 2A — SERVER service for the session-scoped Customer Context. The SESSION block (room /
// status / start / language) is read from the guest session. The CUSTOMER block is a small,
// staff-edited memo stored per session (guest_customer_context, one row per session id). There is
// NO reservation lookup and NO PII estimation (no OTA / CRM / stay-journal matching): staff enter
// the values, and a new session starts empty (never inherits the previous guest).
//
// SERVER-ONLY (imports store). The client uses customerContextApi.ts.

import { getActiveSession } from './store';
import { getContextBySession, upsertContext } from './customerContextStore';
import { roomNoFromChannelKey } from './customerContextView';
import type { CleanContextInput } from './customerContextValidate';
import type { GuestCustomerContext } from './customerContextTypes';

export async function buildGuestCustomerContext(channelKey: string): Promise<GuestCustomerContext> {
  const roomNo = roomNoFromChannelKey(channelKey);
  const session = await getActiveSession(channelKey); // the channel's OPEN session, or null

  if (!session) {
    return {
      session: { channelKey, status: 'none', roomNo, startedAt: null, languageCode: null },
      customer: null, // no open session → nothing to edit
    };
  }

  const row = await getContextBySession(session.id);
  return {
    session: {
      channelKey,
      status: 'open',
      roomNo,
      startedAt: session.started_at,
      languageCode: session.language_code,
    },
    customer: {
      guestName: row?.guest_name ?? '',
      guestPhone: row?.guest_phone ?? '',
      checkOutDate: row?.check_out_date ?? null,
      vehicleNo: row?.vehicle_no ?? '',
      memo: row?.memo ?? '',
      updatedAt: row?.updated_at ?? null,
      updatedBy: row?.updated_by ?? null,
    },
  };
}

/**
 * Save the memo for the channel's CURRENT open session. Returns the rebuilt context, or null when
 * there is no open session (the caller 409s — you cannot record a customer with no active guest).
 */
export async function saveGuestCustomerContext(
  channelKey: string,
  input: CleanContextInput,
  updatedBy: string | null,
): Promise<GuestCustomerContext | null> {
  const session = await getActiveSession(channelKey);
  if (!session) return null;
  await upsertContext(session.id, input, updatedBy);
  return buildGuestCustomerContext(channelKey);
}
