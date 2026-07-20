// Phase 1H.7 — PURE, import-free so it is unit-testable under `node --test` (no `@/` alias).
// Classifies a Supabase/Postgres insert error against guest_chat_sessions: is it the
// one-open-per-channel partial-unique-index conflict (the concurrent-claim race)?
//
// The ONLY unique constraints on guest_chat_sessions are the PK (id = gen_random_uuid, so a
// collision is astronomically improbable) and the partial one-open-per-channel index. We treat
// a 23505 as the claim race — EXCEPT when the driver explicitly names the pkey, so an unrelated
// unique violation is never silently swallowed as 'occupied'. Non-23505 errors are real faults.

export interface PgErrorLike {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}

export function isOneOpenConflict(error: PgErrorLike | null | undefined): boolean {
  if (!error || error.code !== '23505') return false;
  const blob = `${error.message ?? ''} ${error.details ?? ''} ${error.hint ?? ''}`.toLowerCase();
  if (blob.includes('pkey')) return false; // primary-key collision — NOT the channel-claim race
  return true; // the open-session partial index is the only other unique on this table
}
