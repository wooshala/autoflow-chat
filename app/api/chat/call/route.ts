import { NextRequest } from 'next/server';
import { jsonErr, jsonOk } from '@/lib/api/envelope';
import { recordCall } from '@/lib/services/chatCall';
import { isReaderId } from '@/lib/chat/readerIdentity';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const message_id = String(body.message_id || '');
    const caller_reader_id = String(body.caller_reader_id || '');
    const room_id = body.room_id ? String(body.room_id) : null;

    if (!message_id) return jsonErr('CALL_VALIDATION', 'message_id required', 400);
    if (!isReaderId(caller_reader_id)) return jsonErr('CALL_VALIDATION', 'valid caller_reader_id required', 400);

    const result = await recordCall({ messageId: message_id, callerReaderId: caller_reader_id, roomId: room_id });

    if (result.status === 'not_found') return jsonErr('CALL_NOT_FOUND', '메시지를 찾을 수 없습니다.', 404);
    if (result.status === 'cooldown') {
      const secs = Math.ceil((result.cooldownRemainingMs || 0) / 1000);
      return jsonErr('CALL_COOLDOWN', `cooldown ${secs}s`, 429);
    }
    return jsonOk(result);
  } catch (error: any) {
    console.error('[CHAT_CALL_API_ERR]', error?.message || String(error));
    return jsonErr('CALL_FAILED', error?.message || String(error), 500);
  }
}
