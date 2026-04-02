import { NextRequest } from 'next/server';
import { jsonErr, jsonOk } from '@/lib/api/envelope';
import { updateChatMessage } from '@/lib/services/chat';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const messageId = String(body?.message_id || '');
    const ticketId = String(body?.ticket_id || '');
    const roomNo = body?.room_no ? String(body.room_no) : null;
    if (!messageId || !ticketId) {
      return jsonErr('MANUAL_TICKET_VALIDATION', 'message_id and ticket_id are required', 400);
    }

    await updateChatMessage({
      messageId,
      ticket_id: ticketId,
      room_no: roomNo,
      ai_action: 'ticket_created_manual'
    });

    return jsonOk({
      message: {
        id: messageId,
        ticket_id: ticketId,
        room_no: roomNo,
        ai_action: 'ticket_created_manual' as const
      }
    });
  } catch (error: any) {
    return jsonErr('MANUAL_TICKET_FAILED', error?.message || 'manual ticket link failed', 500);
  }
}
