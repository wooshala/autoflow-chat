// Phase 2A — SERVER-ONLY persistence for the session-scoped Customer Context (imports the
// service-role client). One row per guest_chat_sessions.id (session_id UNIQUE). Never import
// from a client component. Throws DB_UNAVAILABLE / DB_ERROR so the route maps them to 503/500.

import { supabaseAdmin } from '@/lib/supabase';
import type { CleanContextInput } from './customerContextValidate';

const TABLE = 'guest_customer_context';
const COLS = 'session_id, guest_name, guest_phone, check_out_date, vehicle_no, memo, updated_at, updated_by';

export interface CustomerContextRow {
  session_id: string;
  guest_name: string;
  guest_phone: string;
  check_out_date: string | null;
  vehicle_no: string;
  memo: string;
  updated_at: string | null;
  updated_by: string | null;
}

function db() {
  if (!supabaseAdmin) throw new Error('DB_UNAVAILABLE');
  return supabaseAdmin;
}

/** The context row for ONE session, or null when nothing has been saved yet. */
export async function getContextBySession(sessionId: string): Promise<CustomerContextRow | null> {
  const { data, error } = await db().from(TABLE).select(COLS).eq('session_id', sessionId).maybeSingle();
  if (error) throw new Error(`DB_ERROR: ${error.message}`);
  return (data as CustomerContextRow | null) ?? null;
}

/** Upsert the context for ONE session (conflict on session_id). Server sets updated_at/by. */
export async function upsertContext(
  sessionId: string,
  input: CleanContextInput,
  updatedBy: string | null,
): Promise<CustomerContextRow> {
  const { data, error } = await db()
    .from(TABLE)
    .upsert(
      {
        session_id: sessionId,
        guest_name: input.guestName,
        guest_phone: input.guestPhone,
        check_out_date: input.checkOutDate,
        vehicle_no: input.vehicleNo,
        memo: input.memo,
        updated_at: new Date().toISOString(),
        // cap to match the DB CHECK (updated_by <= 100); staff display name is server-set.
        updated_by: updatedBy ? updatedBy.slice(0, 100) : null,
      },
      { onConflict: 'session_id' },
    )
    .select(COLS)
    .single();
  if (error) throw new Error(`DB_ERROR: ${error.message}`);
  return data as CustomerContextRow;
}
