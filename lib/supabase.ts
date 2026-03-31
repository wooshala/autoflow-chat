import { createClient } from '@supabase/supabase-js';

// Admin client URL must be the project root (NOT /rest/v1).
// Force Primary/root URL to bypass any load balancer URL that may be used on the client.
const FORCED_SUPABASE_ADMIN_URL = 'https://zraynckvincilfbekbld.supabase.co';
const primarySupabaseUrl = process.env.SUPABASE_PRIMARY_URL || FORCED_SUPABASE_ADMIN_URL;

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

export const supabaseAdmin = primarySupabaseUrl && (supabaseServiceRoleKey || supabaseAnonKey)
  ? createClient(primarySupabaseUrl, supabaseServiceRoleKey || supabaseAnonKey!)
  : null;

 