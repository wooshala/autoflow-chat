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
    if (!roomId || !UUID_RE.test(roomId)) {
      return NextResponse.json({ error: '유효하지 않은 roomId' }, { status: 400 });
    }

    const participants = await listActiveChatRoomParticipants(roomId);
    return NextResponse.json(participants);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '참가자 조회 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
