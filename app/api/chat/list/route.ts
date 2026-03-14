import { NextRequest, NextResponse } from 'next/server';
import { listChatMessages } from '@/lib/services/chat';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = Number(searchParams.get('limit') || '50');
  const messages = await listChatMessages(limit);
  return NextResponse.json({ messages });
}
