import { NextRequest } from 'next/server';
import { jsonErr, jsonOk } from '@/lib/api/envelope';
import { revokeSessionToken } from '@/lib/services/staffAccounts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

// Phase 1: revoke the current account session (idempotent). Invite auth untouched.

function bearerToken(req: NextRequest): string {
  const h = req.headers.get('authorization') || '';
  return h.toLowerCase().startsWith('bearer ') ? h.slice(7).trim() : '';
}

export async function POST(req: NextRequest) {
  try {
    let token = bearerToken(req);
    if (!token) {
      const body = await req.json().catch(() => ({} as Record<string, unknown>));
      token = String((body as any)?.sessionToken ?? (body as any)?.session_token ?? '');
    }
    await revokeSessionToken(token);
    return jsonOk({ ok: true });
  } catch (e: unknown) {
    console.error('[STAFF_LOGOUT_FAILED]', e);
    return jsonErr('STAFF_LOGOUT_FAILED', 'Logout failed.', 500);
  }
}
