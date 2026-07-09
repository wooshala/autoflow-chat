import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null | undefined;

/**
 * Stay-journal (univer-ops ledger) admin client.
 * Env: STAY_JOURNAL_SUPABASE_URL + STAY_JOURNAL_SERVICE_ROLE_KEY
 * Returns null when unset (match → unavailable).
 */
export function getStayJournalAdmin(): SupabaseClient | null {
  if (cached !== undefined) return cached;

  const url = process.env.STAY_JOURNAL_SUPABASE_URL?.trim() || '';
  const key = process.env.STAY_JOURNAL_SERVICE_ROLE_KEY?.trim() || '';
  if (!url || !key) {
    cached = null;
    return cached;
  }

  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
  return cached;
}

export function isStayJournalConfigured(): boolean {
  return Boolean(
    process.env.STAY_JOURNAL_SUPABASE_URL?.trim() && process.env.STAY_JOURNAL_SERVICE_ROLE_KEY?.trim()
  );
}
