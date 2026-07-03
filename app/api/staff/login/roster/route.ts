import { jsonErr, jsonOk } from '@/lib/api/envelope';
import { listRosterAccounts } from '@/lib/services/staffAccounts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

// Phase 1: active-account roster for the name-select login screen (API only; no UI wired).
// Returns display names + account ids only — no secrets.

export async function GET() {
  try {
    const roster = await listRosterAccounts();
    return jsonOk({ roster });
  } catch (e: unknown) {
    console.error('[STAFF_LOGIN_ROSTER_FAILED]', e);
    return jsonErr('STAFF_LOGIN_ROSTER_FAILED', 'Roster load failed.', 500);
  }
}
