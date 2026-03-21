import { NextRequest, NextResponse } from 'next/server';
import { softDeleteChatMessage } from '@/lib/services/chat';

const logDeleteApiDebug = (...args: unknown[]) => {
  if (process.env.NODE_ENV === 'development') {
    console.log(...args);
  }
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const message_id = String(body.message_id || '');
    const user_id = String(body.user_id || '');
    // [DEBUG] 추후 제거 가능
    logDeleteApiDebug('[CHAT_DELETE_API]', { messageId: message_id, userId: user_id });
    if (!message_id || !user_id) {
      return NextResponse.json({ error: 'message_id and user_id required' }, { status: 400 });
    }
    const message = await softDeleteChatMessage({ messageId: message_id, userId: user_id });
    // [DEBUG] 추후 제거 가능
    logDeleteApiDebug('[CHAT_DELETE_API_OK]', {
      messageId: message?.id,
      is_deleted: message?.is_deleted,
      deleted_at: message?.deleted_at ?? null
    });
    return NextResponse.json({ message });
  } catch (error: any) {
    console.error('[CHAT_DELETE_API_ERR]', error?.message || String(error));
    const msg = error?.message || String(error);
    if (msg.includes('권한')) {
      return NextResponse.json({ error: msg }, { status: 403 });
    }
    if (msg.includes('찾을 수 없습니다')) {
      return NextResponse.json({ error: msg }, { status: 404 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
