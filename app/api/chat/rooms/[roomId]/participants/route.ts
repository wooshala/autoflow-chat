import { NextRequest, NextResponse } from 'next/server';
import { jsonErr, jsonOk } from '@/lib/api/envelope';
import { listActiveChatRoomParticipants } from '@/lib/services/chatRoom';
import { log } from '@/lib/logger';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TAG = '[ROOM_PARTICIPANTS_API]';

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ roomId: string }> }
) {
  try {
    const { roomId: raw } = await ctx.params;
    const roomId = String(raw ?? '').trim();
    log.info(TAG, 'start', { room_id: roomId || null });
    if (!roomId) {
      log.info(TAG, 'validate', { ok: false, reason: 'missing_room_id' });
      return jsonErr('MISSING_ROOM_ID', 'roomId가 필요합니다.', 400);
    }
    if (!UUID_RE.test(roomId)) {
      log.info(TAG, 'validate', { ok: false, reason: 'invalid_uuid' });
      return jsonErr('INVALID_ROOM_ID', 'roomId는 유효한 UUID 형식이어야 합니다.', 400);
    }

    const participants = await listActiveChatRoomParticipants(roomId);
    log.info(TAG, 'ok', {
      room_id: roomId,
      count: Array.isArray(participants) ? participants.length : null
    });
    return jsonOk(participants);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '참가자 조회 실패';
    log.error(TAG, 'error', { ok: false, error: message });
    return jsonErr('PARTICIPANTS_QUERY_FAILED', message, 500);
  }
}
