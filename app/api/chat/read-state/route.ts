import { NextRequest } from 'next/server';
import { jsonErr, jsonOk } from '@/lib/api/envelope';
import { getReadState } from '@/lib/services/chatReadState';

// Reads query params + live DB state — must never be statically rendered/cached.
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const raw = req.nextUrl.searchParams.get('room_id');
    const roomId = raw && raw.trim() ? raw.trim() : null;
    const data = await getReadState(roomId);
    return jsonOk(data);
  } catch (error: any) {
    console.error('[CHAT_READ_STATE_API_ERR]', error?.message || String(error));
    return jsonErr('READ_STATE_FAILED', error?.message || String(error), 500);
  }
}
