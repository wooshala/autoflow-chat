import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!(globalThis as any).__autoflowSupabaseUrlLogged) {
  console.log('[SUPABASE_URL]', process.env.NEXT_PUBLIC_SUPABASE_URL || null);
  (globalThis as any).__autoflowSupabaseUrlLogged = true;
}

export const hasSupabase = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = hasSupabase
  ? createClient(supabaseUrl!, supabaseAnonKey!)
  : null;

export const supabaseAdmin = supabaseUrl && (supabaseServiceRoleKey || supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseServiceRoleKey || supabaseAnonKey!)
  : null;

 