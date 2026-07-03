import { NextRequest } from 'next/server';
import { jsonErr, jsonOk } from '@/lib/api/envelope';
import { StaffAccountError, validateSessionToken } from '@/lib/services/staffAccounts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

// Phase 1: validate an account session token (Bearer) → public account.
// No time-based expiry; a session is valid until revoked/deactivated.

function bearerToken(req: NextRequest): string {
  const h = req.headers.get('authorization') || '';
  return h.toLowerCase().startsWith('bearer ') ? h.slice(7).trim() : '';
}

export async function GET(req: NextRequest) {
  try {
    const account = await validateSessionToken(bearerToken(req));
    return jsonOk({ account });
  } catch (e: unknown) {
    if (e instanceof StaffAccountError) {
      const status = e.message === 'ACCOUNT_DEACTIVATED' ? 403 : 401;
      return jsonErr(e.message, e.message, status);
    }
    console.error('[STAFF_SESSION_FAILED]', e);
    return jsonErr('STAFF_SESSION_FAILED', 'Session validation failed.', 500);
  }
}
