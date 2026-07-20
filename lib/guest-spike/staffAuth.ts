// Phase 1H.7 — server-only staff authentication for guest-chat staff paths. REUSES the
// existing staff account session (validateSessionToken). `?as=staff` is only a MODE hint;
// real authority comes from the Authorization: Bearer <staff_session_token> header, which
// the server validates here. No new auth system.

import type { NextRequest } from 'next/server';
import { validateSessionToken, type StaffAccountPublic } from '@/lib/services/staffAccounts';

export function bearerFrom(req: NextRequest): string {
  const h = req.headers.get('authorization') || '';
  return h.toLowerCase().startsWith('bearer ') ? h.slice(7).trim() : '';
}

/** Validate the Bearer staff session, or null (missing / expired / unknown / deactivated). */
export async function requireStaff(req: NextRequest): Promise<StaffAccountPublic | null> {
  const token = bearerFrom(req);
  if (!token) return null;
  try {
    return await validateSessionToken(token);
  } catch {
    return null;
  }
}
