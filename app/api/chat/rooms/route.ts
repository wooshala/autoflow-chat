import { NextResponse } from 'next/server';
import { listChatRoomSummaries } from '@/lib/services/chatRoom';

// 읽기 전용. GET에서 DB write 없음. 재조회가 stale 캐시를 받지 않도록 동적 처리.
export const dynamic = 'force-dynamic';
// Phase 1.2.5 A-4: ISR/route 캐시 무효화(항상 최신 요약). 별도 장기 캐시 헤더는 추가하지 않는다.
export const revalidate = 0;

export async function GET() {
  try {
    // Phase 1.2.6 D: summary_source(rpc|legacy)/degraded를 응답에 노출 → Preview/Staging Network
    //   응답만으로 어떤 최근메시지 경로가 실행됐는지 확인 가능(폴백을 RPC 성공으로 오인 방지).
    const { rooms, summarySource, degraded } = await listChatRoomSummaries();
    return NextResponse.json({ rooms, summary_source: summarySource, degraded });
  } catch (err: any) {
    console.error('[CHAT_ROOMS_ROUTE_ERROR]', { message: err?.message ?? String(err) });
    return NextResponse.json(
      { rooms: [], error: err?.message ?? 'unknown', summary_source: 'legacy', degraded: true },
      { status: 500 }
    );
  }
}
