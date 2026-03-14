import { NextRequest, NextResponse } from 'next/server';
import { createTicket } from '@/lib/services/maintenance';
import { listChatMessages } from '@/lib/services/chat';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const ticket = await createTicket(body);
    const messages = await listChatMessages(1);
    return NextResponse.json({ ticket, chat_message: messages[messages.length - 1] || null });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || '유지보수 생성 실패' }, { status: 500 });
  }
}
