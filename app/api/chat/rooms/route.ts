import { NextResponse } from 'next/server';
import { listChatRoomSummaries } from '@/lib/services/chatRoom';

// 읽기 전용. GET에서 DB write 없음. 재조회가 stale 캐시를 받지 않도록 동적 처리.
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const rooms = await listChatRoomSummaries();
    return NextResponse.json({ rooms });
  } catch (err: any) {
    console.error('[CHAT_ROOMS_ROUTE_ERROR]', { message: err?.message ?? String(err) });
    return NextResponse.json({ rooms: [], error: err?.message ?? 'unknown' }, { status: 500 });
  }
}
