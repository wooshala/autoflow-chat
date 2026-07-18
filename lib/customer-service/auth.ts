// Phase 1A — auth/tenant boundary helpers for the customer-service channel.
//
// IMPORTANT (tenant honesty): this repo's staff auth is invite/session based and is
// NOT Supabase Auth (there is no auth.uid() to key RLS on). So in 1A we do NOT claim
// to derive a trusted staff tenant from a cookie yet. Instead:
//
//   * The customer channel is default-deny at the DB (RLS, no anon policy) and all
//     access is server-service-role mediated.
//   * Staff-side repository functions REQUIRE a StaffContext { site_id, staff_user_id }
//     that the CALLING server route must have already verified. `requireStaffContext`
//     fails closed if that context is missing/blank — it never invents a tenant.
//   * Wiring `resolveStaffContextFromRequest` to the real staff session
//     (staff_sessions / staff_invites → users → site_id) is the FIRST task of
//     Phase 1B. Until then no staff-facing customer route may ship.
//
// This is deliberately explicit rather than a hidden BLOCKED: the minimum safe
// structure exists now; the follow-up auth wiring is named.

import type { GuestSessionContext, StaffContext } from './types';
import { assertSiteId, assertUuid } from './validation';

/**
 * Guard for staff repository calls. Throws if the caller did not supply a fully
 * verified staff context. NEVER defaults site_id — an unauthenticated call fails.
 */
export function requireStaffContext(ctx: Partial<StaffContext> | null | undefined): StaffContext {
  if (!ctx) throw new Error('staff context required (unauthenticated staff call rejected)');
  return {
    site_id: assertSiteId(ctx.site_id),
    staff_user_id: assertUuid(ctx.staff_user_id, 'staff_user_id'),
  };
}

/**
 * Phase 1B stub. In 1A there is no verified staff→tenant derivation, so this always
 * returns null (fail closed). Do NOT replace with a client-trusted site_id.
 * Phase 1B implements it against staff_sessions/staff_invites.
 */
export async function resolveStaffContextFromRequest(
  _req: unknown,
): Promise<StaffContext | null> {
  return null;
}

/**
 * A guest handler must only trust the GuestSessionContext returned by
 * validateCustomerAccessToken — never a client-supplied conversation_id/room_no.
 * This asserts the shape as a final gate before use.
 */
export function requireGuestSession(
  ctx: GuestSessionContext | null | undefined,
): GuestSessionContext {
  if (!ctx) throw new Error('guest session required (invalid or missing token)');
  return {
    site_id: assertSiteId(ctx.site_id),
    stay_id: assertUuid(ctx.stay_id, 'stay_id'),
    conversation_id: assertUuid(ctx.conversation_id, 'conversation_id'),
    token_id: assertUuid(ctx.token_id, 'token_id'),
  };
}
