import { NextRequest, NextResponse } from 'next/server';
import { listActiveChatRoomParticipants } from '@/lib/services/chatRoom';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _req: NextRequest,
  { params }: { params: { roomId: string } }
) {
  try {
    const raw = params.roomId;
    const roomId = raw?.trim() || '';
    console.log('[ROOM_PARTICIPANTS_API_START]', { ok: true, room_id: roomId || null });
    if (!roomId || !UUID_RE.test(roomId)) {
      console.log('[ROOM_PARTICIPANTS_API_VALIDATE]', { ok: false, reason: 'invalid_room_id' });
      return NextResponse.json({ error: '유효하지 않은 roomId' }, { status: 400 });
    }

    const participants = await listActiveChatRoomParticipants(roomId);
    console.log('[ROOM_PARTICIPANTS_API_RESULT]', {
      ok: true,
      room_id: roomId,
      count: Array.isArray(participants) ? participants.length : null
    });
    return NextResponse.json(participants);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '참가자 조회 실패';
    console.log('[ROOM_PARTICIPANTS_API_RESULT]', { ok: false, error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
