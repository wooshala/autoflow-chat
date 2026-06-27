import { NextRequest } from 'next/server';
import { jsonErr, jsonOk } from '@/lib/api/envelope';
import { advanceReadState } from '@/lib/services/chatReadState';
import { isReaderId } from '@/lib/chat/readerIdentity';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const reader_id = String(body.reader_id || '');
    const room_id = body.room_id ? String(body.room_id) : null;
    const last_read_message_id = body.last_read_message_id ? String(body.last_read_message_id) : null;
    const last_read_at = String(body.last_read_at || '');

    if (!isReaderId(reader_id)) return jsonErr('READ_VALIDATION', 'valid reader_id required', 400);
    if (!last_read_at) return jsonErr('READ_VALIDATION', 'last_read_at required', 400);

    await advanceReadState({
      readerId: reader_id,
      roomId: room_id,
      lastReadMessageId: last_read_message_id,
      lastReadAt: last_read_at
    });
    return jsonOk({ ok: true });
  } catch (error: any) {
    console.error('[CHAT_READ_API_ERR]', error?.message || String(error));
    return jsonErr('READ_FAILED', error?.message || String(error), 500);
  }
}
