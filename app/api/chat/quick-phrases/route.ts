import { NextRequest } from 'next/server';
import { formatUnknownError, jsonErr, jsonOk } from '@/lib/api/envelope';
import { readStaffSessionToken } from '@/lib/auth/staffSessionRequest';
import { listMergedQuickPhrases } from '@/lib/services/quickPhrases';
import { resolveStaffSessionToken } from '@/lib/services/staffSessions';
import { getSiteId } from '@/lib/site';

export async function GET(req: NextRequest) {
  try {
    let userId: string | null = null;
    const token = readStaffSessionToken(req);
    if (token) {
      const session = await resolveStaffSessionToken(token);
      if (session.ok && session.public.userId) {
        userId = session.public.userId;
      }
    }
    const phrases = await listMergedQuickPhrases(userId, getSiteId());
    return jsonOk({ phrases });
  } catch (e: unknown) {
    return jsonErr('QUICK_PHRASES_LIST_FAILED', formatUnknownError(e), 500);
  }
}
