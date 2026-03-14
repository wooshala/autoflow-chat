import { NextRequest, NextResponse } from 'next/server';
import { createChatMessage } from '@/lib/services/chat';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.user_id || !body.message) {
      return NextResponse.json({ error: 'user_id, message required' }, { status: 400 });
    }
    const message = await createChatMessage(body);
    return NextResponse.json({ message });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || '메시지 저장 실패' }, { status: 500 });
  }
}
