import { NextRequest, NextResponse } from 'next/server';
import { updateChatMessage } from '@/lib/services/chat';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const messageId = String(body?.message_id || '');
    const ticketId = String(body?.ticket_id || '');
    const roomNo = body?.room_no ? String(body.room_no) : null;
    if (!messageId || !ticketId) {
      return NextResponse.json({ error: 'message_id and ticket_id are required' }, { status: 400 });
    }

    await updateChatMessage({
      messageId,
      ticket_id: ticketId,
      room_no: roomNo,
      ai_action: 'ticket_created_manual'
    });

    return NextResponse.json({
      ok: true,
      message: {
        id: messageId,
        ticket_id: ticketId,
        room_no: roomNo,
        ai_action: 'ticket_created_manual'
      }
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'manual ticket link failed' }, { status: 500 });
  }
}
