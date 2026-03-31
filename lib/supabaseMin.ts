import { createClient, SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

function required(name: string, value: string | undefined): string {
  const v = String(value || '').trim();
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

/**
 * Minimal repro Supabase client (server-only).
 * Uses a separate project URL/key to avoid touching the main project's behavior.
 */
export function getMinSupabaseAdmin(): SupabaseClient {
  if (client) return client;
  const url = required('SUPABASE_MIN_URL', process.env.SUPABASE_MIN_URL);
  const serviceKey = required('SUPABASE_MIN_SERVICE_ROLE_KEY', process.env.SUPABASE_MIN_SERVICE_ROLE_KEY);
  client = createClient(url, serviceKey);
  return client;
}

