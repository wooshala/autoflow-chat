import { NextRequest } from 'next/server';
import { jsonErr, jsonOk } from '@/lib/api/envelope';
import { getMinSupabaseAdmin } from '@/lib/supabaseMin';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const user_id = typeof body?.user_id === 'string' ? body.user_id : null;
    const message = typeof body?.message === 'string' ? body.message : null;
    const message_type = typeof body?.message_type === 'string' ? body.message_type : null;
    const sender_side = typeof body?.sender_side === 'string' ? body.sender_side : null;
    const room_no = typeof body?.room_no === 'string' ? body.room_no : null;
    const ticket_id = typeof body?.ticket_id === 'string' ? body.ticket_id : null;
    const duplicate_ticket_id = typeof body?.duplicate_ticket_id === 'string' ? body.duplicate_ticket_id : null;
    const ai_action = typeof body?.ai_action === 'string' ? body.ai_action : null;

    const supabase = getMinSupabaseAdmin();
    const { data, error } = await supabase
      .from('chat_messages')
      .insert({
        user_id,
        message,
        message_type,
        sender_side,
        room_no,
        ticket_id,
        duplicate_ticket_id,
        ai_action
      })
      .select('*')
      .single();

    if (error) {
      return jsonErr('MIN_SEND_INSERT_FAILED', error.message, 500);
    }

    console.log('[MIN_SEND_INSERT_DONE]', {
      id: (data as any)?.id ?? null,
      created_at: (data as any)?.created_at ?? null
    });

    return jsonOk({ message: data });
  } catch (e: any) {
    return jsonErr('MIN_SEND_FAILED', e?.message || String(e), 500);
  }
}
