import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { IS_MOCK } from '@/lib/env';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * Phase 1 — staff account login backend (server-side).
 * Additive & self-contained: does NOT touch invite auth, chat, FCM, or existing tables.
 * Wiring to StaffChatClient / FCM happens in later phases.
 */

/** Public account shape returned to the client (no secrets). */
export type StaffAccountPublic = {
  accountId: string;
  /** existing users(id) — required for sender_name / FCM target / read-receipt identity. */
  userId: string;
  displayName: string;
  role: string;
  siteId: string;
  /** e.g. 'ru' — used later by chat TTS/translation. */
  spokenLang: string | null;
  /** account login has no invite; kept for client type-compat (always null here). */
  inviteId: string | null;
};

export type StaffAccountRosterItem = { accountId: string; displayName: string };

type StaffAccountRow = {
  id: string;
  user_id: string | null;
  display_name: string;
  login_code_hash: string;
  role: string;
  site_id: string;
  spoken_lang: string | null;
  is_active: boolean;
  failed_attempts: number;
  locked_until: string | null;
  created_at: string;
  updated_at: string;
};

type StaffSessionRow = {
  id: string;
  staff_account_id: string;
  session_hash: string;
  device_id: string | null;
  created_at: string;
  last_seen_at: string;
  revoked_at: string | null;
};

/** Thrown with a stable code as `.message` so route handlers can map to jsonErr. */
export class StaffAccountError extends Error {}

// ── login_code hashing (scrypt, per-code random salt) ────────────────────────
// 4-digit codes are low entropy → a slow, salted KDF (scrypt) + server-side
// lockout are the defense. Format: `scrypt$<saltHex>$<derivedHex>`.
const SCRYPT_KEYLEN = 32;

export function hashLoginCode(code: string): string {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(code, salt, SCRYPT_KEYLEN).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

export function verifyLoginCode(code: string, stored: string): boolean {
  const parts = String(stored || '').split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, saltHex, derivedHex] = parts;
  let expected: Buffer;
  try {
    expected = Buffer.from(derivedHex, 'hex');
  } catch {
    return false;
  }
  const actual = scryptSync(code, saltHex, expected.length || SCRYPT_KEYLEN);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

// ── session token (raw random; only SHA-256 hash persisted) ──────────────────
function newSessionToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString('hex');
  return { raw, hash: sessionHashOf(raw) };
}

export function sessionHashOf(rawToken: string): string {
  return createHash('sha256').update(String(rawToken)).digest('hex');
}

// ── brute-force lockout policy (per-account) ─────────────────────────────────
// 1–4 fail: no lock. 5–9: 30s. 10–14: 5min. 15+: admin unlock required.
const LOCK_ADMIN_SENTINEL_MS = 100 * 365 * 24 * 60 * 60 * 1000;

export function lockUntilForAttempts(failedAttempts: number, nowMs: number): string | null {
  if (failedAttempts < 5) return null;
  if (failedAttempts < 10) return new Date(nowMs + 30_000).toISOString();
  if (failedAttempts < 15) return new Date(nowMs + 5 * 60_000).toISOString();
  return new Date(nowMs + LOCK_ADMIN_SENTINEL_MS).toISOString();
}

function isValid4DigitCode(code: string): boolean {
  return /^\d{4}$/.test(code);
}

function toPublic(row: StaffAccountRow): StaffAccountPublic {
  if (!row.user_id) throw new StaffAccountError('STAFF_IDENTITY_REQUIRED');
  return {
    accountId: row.id,
    userId: row.user_id,
    displayName: row.display_name,
    role: row.role,
    siteId: row.site_id,
    spokenLang: row.spoken_lang,
    inviteId: null
  };
}

// ── storage backend: supabase (prod) or in-memory (mock/tests) ───────────────
function useMock(): boolean {
  return IS_MOCK || !supabaseAdmin;
}

declare global {
  // eslint-disable-next-line no-var
  var __autoflowStaffAccounts: StaffAccountRow[] | undefined;
  // eslint-disable-next-line no-var
  var __autoflowStaffSessions: StaffSessionRow[] | undefined;
}

function mockAccounts(): StaffAccountRow[] {
  if (!globalThis.__autoflowStaffAccounts) globalThis.__autoflowStaffAccounts = [];
  return globalThis.__autoflowStaffAccounts;
}
function mockSessions(): StaffSessionRow[] {
  if (!globalThis.__autoflowStaffSessions) globalThis.__autoflowStaffSessions = [];
  return globalThis.__autoflowStaffSessions;
}

async function getAccountById(accountId: string): Promise<StaffAccountRow | null> {
  if (useMock()) {
    return mockAccounts().find((a) => a.id === accountId) ?? null;
  }
  const { data, error } = await supabaseAdmin!
    .from('staff_accounts')
    .select('*')
    .eq('id', accountId)
    .maybeSingle();
  if (error) throw new StaffAccountError(error.message);
  return (data as StaffAccountRow | null) ?? null;
}

async function persistAccountAttempts(
  accountId: string,
  failedAttempts: number,
  lockedUntil: string | null
): Promise<void> {
  if (useMock()) {
    const a = mockAccounts().find((x) => x.id === accountId);
    if (a) {
      a.failed_attempts = failedAttempts;
      a.locked_until = lockedUntil;
      a.updated_at = new Date().toISOString();
    }
    return;
  }
  const { error } = await supabaseAdmin!
    .from('staff_accounts')
    .update({ failed_attempts: failedAttempts, locked_until: lockedUntil })
    .eq('id', accountId);
  if (error) throw new StaffAccountError(error.message);
}

async function insertSession(row: { staff_account_id: string; session_hash: string; device_id: string | null }): Promise<void> {
  if (useMock()) {
    const now = new Date().toISOString();
    mockSessions().push({
      id: randomBytes(16).toString('hex'),
      staff_account_id: row.staff_account_id,
      session_hash: row.session_hash,
      device_id: row.device_id,
      created_at: now,
      last_seen_at: now,
      revoked_at: null
    });
    return;
  }
  const { error } = await supabaseAdmin!
    .from('staff_sessions')
    .insert({
      staff_account_id: row.staff_account_id,
      session_hash: row.session_hash,
      device_id: row.device_id
    });
  if (error) throw new StaffAccountError(error.message);
}

async function findActiveSession(sessionHash: string): Promise<StaffSessionRow | null> {
  if (useMock()) {
    return mockSessions().find((s) => s.session_hash === sessionHash && !s.revoked_at) ?? null;
  }
  const { data, error } = await supabaseAdmin!
    .from('staff_sessions')
    .select('*')
    .eq('session_hash', sessionHash)
    .is('revoked_at', null)
    .maybeSingle();
  if (error) throw new StaffAccountError(error.message);
  return (data as StaffSessionRow | null) ?? null;
}

async function touchSession(sessionHash: string): Promise<void> {
  if (useMock()) {
    const s = mockSessions().find((x) => x.session_hash === sessionHash && !x.revoked_at);
    if (s) s.last_seen_at = new Date().toISOString();
    return;
  }
  await supabaseAdmin!
    .from('staff_sessions')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('session_hash', sessionHash)
    .is('revoked_at', null);
}

async function revokeByHash(sessionHash: string): Promise<void> {
  if (useMock()) {
    const s = mockSessions().find((x) => x.session_hash === sessionHash && !x.revoked_at);
    if (s) s.revoked_at = new Date().toISOString();
    return;
  }
  await supabaseAdmin!
    .from('staff_sessions')
    .update({ revoked_at: new Date().toISOString() })
    .eq('session_hash', sessionHash)
    .is('revoked_at', null);
}

// ── public API ───────────────────────────────────────────────────────────────

/**
 * Verify name-selected account + 4-digit code, apply lockout, issue a session.
 * Throws StaffAccountError with a stable code on failure.
 */
export async function loginWithCode(input: {
  accountId: string;
  loginCode: string;
  deviceId: string | null;
}): Promise<{ sessionToken: string; account: StaffAccountPublic }> {
  const accountId = String(input.accountId || '').trim();
  const loginCode = String(input.loginCode || '').trim();
  const deviceId = input.deviceId ? String(input.deviceId).trim() : null;

  if (!accountId) throw new StaffAccountError('ACCOUNT_REQUIRED');
  if (!isValid4DigitCode(loginCode)) throw new StaffAccountError('LOGIN_CODE_INVALID');

  const account = await getAccountById(accountId);
  if (!account) throw new StaffAccountError('ACCOUNT_NOT_FOUND');
  if (!account.is_active) throw new StaffAccountError('ACCOUNT_DEACTIVATED');
  if (!account.user_id) throw new StaffAccountError('STAFF_IDENTITY_REQUIRED');

  const nowMs = Date.now();
  if (account.locked_until && new Date(account.locked_until).getTime() > nowMs) {
    throw new StaffAccountError('LOGIN_LOCKED');
  }

  if (!verifyLoginCode(loginCode, account.login_code_hash)) {
    const nextAttempts = (account.failed_attempts ?? 0) + 1;
    await persistAccountAttempts(accountId, nextAttempts, lockUntilForAttempts(nextAttempts, nowMs));
    throw new StaffAccountError('LOGIN_CODE_INVALID');
  }

  // success → reset lockout, issue session
  await persistAccountAttempts(accountId, 0, null);
  const { raw, hash } = newSessionToken();
  await insertSession({ staff_account_id: accountId, session_hash: hash, device_id: deviceId });

  return { sessionToken: raw, account: toPublic(account) };
}

/** Validate a raw session token → public account. Throws on invalid/deactivated. */
export async function validateSessionToken(rawToken: string): Promise<StaffAccountPublic> {
  const token = String(rawToken || '').trim();
  if (!token) throw new StaffAccountError('SESSION_REQUIRED');
  const session = await findActiveSession(sessionHashOf(token));
  if (!session) throw new StaffAccountError('SESSION_INVALID');
  const account = await getAccountById(session.staff_account_id);
  if (!account) throw new StaffAccountError('SESSION_INVALID');
  if (!account.is_active) throw new StaffAccountError('ACCOUNT_DEACTIVATED');
  await touchSession(session.session_hash);
  return toPublic(account);
}

/** Revoke (logout) a session by its raw token. Idempotent. */
export async function revokeSessionToken(rawToken: string): Promise<void> {
  const token = String(rawToken || '').trim();
  if (!token) return;
  await revokeByHash(sessionHashOf(token));
}

/** Active accounts for the name-select roster (no secrets). */
export async function listRosterAccounts(): Promise<StaffAccountRosterItem[]> {
  // Only accounts that can actually log in: active AND linked to a users(id).
  // Accounts without user_id are hidden from the roster (safer than showing a
  // name that then fails login).
  if (useMock()) {
    return mockAccounts()
      .filter((a) => a.is_active && Boolean(a.user_id))
      .map((a) => ({ accountId: a.id, displayName: a.display_name }));
  }
  const { data, error } = await supabaseAdmin!
    .from('staff_accounts')
    .select('id, display_name, is_active, user_id')
    .eq('is_active', true)
    .not('user_id', 'is', null)
    .order('display_name', { ascending: true });
  if (error) throw new StaffAccountError(error.message);
  return ((data || []) as Array<{ id: string; display_name: string }>).map((a) => ({
    accountId: a.id,
    displayName: a.display_name
  }));
}
