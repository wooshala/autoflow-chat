// Phase 1I.1-B (option 2) — SERVER service assembling the Customer Information context for a guest
// channel. ONLY the SESSION block is real (from guest_chat_sessions). There is NO reservation
// lookup: Phase 1I.1-C found no authoritative current-stay source, so we do NOT read the stay
// journal, do NOT run a proximity match, and NEVER surface a guest name/phone/derived reservation.
// The reservation block is a fixed 'pending' placeholder until a first-class Reservation entity
// exists. This service performs no PII access and no external stay-journal query.
//
// SERVER-ONLY (imports store). The client uses customerContextApi.ts.

import { getActiveSession } from './store';
import { roomNoFromChannelKey } from './customerContextView';
import type { GuestCustomerContext } from './customerContextTypes';

export async function buildGuestCustomerContext(channelKey: string): Promise<GuestCustomerContext> {
  const roomNo = roomNoFromChannelKey(channelKey);
  const session = await getActiveSession(channelKey); // the channel's OPEN session, or null

  return {
    session: {
      channelKey,
      status: session ? 'open' : 'none',
      roomNo,
      startedAt: session?.started_at ?? null,
      languageCode: session?.language_code ?? null,
    },
    reservation: { availability: 'pending' },
    sources: [{ type: 'guest_session', label: 'Guest Session', updatedAt: session?.started_at ?? null }],
  };
}
