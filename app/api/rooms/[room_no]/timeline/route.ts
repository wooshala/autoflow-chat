import { NextRequest } from 'next/server';
import { jsonOk, jsonErr } from '@/lib/api/envelope';
import { supabaseAdmin } from '@/lib/supabase';
import type { TimelineEvent } from '@/lib/types';

export async function GET(
  _req: NextRequest,
  { params }: { params: { room_no: string } }
) {
  const { room_no } = params;

  if (!supabaseAdmin) {
    return jsonErr('DB_UNAVAILABLE', 'DB를 사용할 수 없습니다.', 503);
  }

  const { data, error } = await supabaseAdmin
    .from('room_timeline')
    .select('room_no, occurred_at, source_type, event_type, summary, severity, reference_id, meta')
    .eq('room_no', room_no)
    .order('occurred_at', { ascending: false })
    .limit(100);

  if (error) {
    return jsonErr('DB_ERROR', error.message, 500);
  }

  return jsonOk<{ events: TimelineEvent[] }>({ events: (data ?? []) as TimelineEvent[] });
}
