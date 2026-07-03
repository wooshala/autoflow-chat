import { NextRequest } from 'next/server';
import { jsonErr, jsonOk } from '@/lib/api/envelope';
import { loginWithCode, StaffAccountError } from '@/lib/services/staffAccounts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

// Phase 1: name-select + 4-digit code login. Issues a session token (raw returned once).
// Does NOT touch invite auth. Brute-force lockout handled inside the service.

const CODE_STATUS: Record<string, number> = {
  ACCOUNT_REQUIRED: 400,
  LOGIN_CODE_INVALID: 401,
  ACCOUNT_NOT_FOUND: 404,
  ACCOUNT_DEACTIVATED: 403,
  STAFF_IDENTITY_REQUIRED: 409,
  LOGIN_LOCKED: 429
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const { sessionToken, account } = await loginWithCode({
      accountId: String((body as any)?.account_id ?? (body as any)?.accountId ?? ''),
      loginCode: String((body as any)?.login_code ?? (body as any)?.loginCode ?? ''),
      deviceId: (body as any)?.device_key ?? (body as any)?.deviceKey ?? (body as any)?.device_id ?? null
    });
    return jsonOk({ sessionToken, account });
  } catch (e: unknown) {
    if (e instanceof StaffAccountError) {
      const status = CODE_STATUS[e.message] ?? 400;
      return jsonErr(e.message, e.message, status);
    }
    console.error('[STAFF_LOGIN_FAILED]', e);
    return jsonErr('STAFF_LOGIN_FAILED', 'Login failed.', 500);
  }
}
