import { createClient } from '@supabase/supabase-js';
import { IS_MOCK } from '@/lib/env';

// Admin client URL must be the project root (NOT /rest/v1).
// Phase 0.5: no implicit Production fallback — SUPABASE_PRIMARY_URL is required in production mode.
const primarySupabaseUrlRaw = process.env.SUPABASE_PRIMARY_URL?.trim() || '';
if (!primarySupabaseUrlRaw && !IS_MOCK) {
  throw new Error(
    'Missing SUPABASE_PRIMARY_URL. Admin Supabase client refuses to start without an explicit primary URL (no Production fallback).'
  );
}
const primarySupabaseUrl = primarySupabaseUrlRaw || null;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!(globalThis as any).__autoflowSupabaseUrlLogged) {
  console.log('[SUPABASE_URL]', process.env.NEXT_PUBLIC_SUPABASE_URL || null);
  console.log('[SUPABASE_PRIMARY_URL]', process.env.SUPABASE_PRIMARY_URL || null);
  (globalThis as any).__autoflowSupabaseUrlLogged = true;
}

export const hasSupabase = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = hasSupabase
  ? createClient(supabaseUrl!, supabaseAnonKey!)
  : null;

export const supabaseAdmin =
  primarySupabaseUrl && (supabaseServiceRoleKey || supabaseAnonKey)
    ? createClient(primarySupabaseUrl, supabaseServiceRoleKey || supabaseAnonKey!)
    : null;

 