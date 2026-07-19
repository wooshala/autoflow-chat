// Phase 1F.12 — pure auth-decision helpers for the customer reply composer.
// NO DOM / NO storage / NO fetch imports here, so every branch is unit-testable
// under `node --test`. The composer/modal own the side effects (storage read,
// modal open, saveStaffSession); these functions only decide *what* should happen.
//
// Two distinct auth systems coexist on /chat (do NOT merge them — Phase 1F.12):
//   • autoflow_user_v1                 = LEGACY /chat UI identity (name only, no server session).
//   • autoflow_staff_session_token_v1  = CANONICAL server auth (staff account session).
// Customer translation REQUIRES the canonical server session — the legacy name is
// never accepted by the translate route (it validates the session token server-side).

export type PublicSendDecision =
  | 'ignore' // nothing to translate (no body)
  | 'need-auth' // public text but NO staff session → show 직원 인증, call NO api
  | 'translate'; // public text + staff session present → call the translate api

/**
 * Decide what a public-mode reply send should do BEFORE any network call. When
 * `hasStaffToken` is false we return 'need-auth' so the composer surfaces the
 * 직원 인증 button and makes zero API requests (draft preserved by the caller).
 */
export function decidePublicSend(input: { hasBody: boolean; hasStaffToken: boolean }): PublicSendDecision {
  if (!input.hasBody) return 'ignore';
  if (!input.hasStaffToken) return 'need-auth';
  return 'translate';
}

export type TranslateFailureKind = 'session-expired' | 'translation-failed';

/**
 * Classify a `translateCustomerReply` rejection. The client throws `HTTP_401`
 * when the translate route rejects the session (missing/expired/invalid). That
 * means the stored staff session must be cleared and re-auth prompted. Any other
 * error is a plain translation failure — keep the draft, keep the session.
 */
export function classifyTranslateFailure(err: unknown): TranslateFailureKind {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return msg === 'HTTP_401' ? 'session-expired' : 'translation-failed';
}

export interface StaffLoginAccount {
  accountId: string;
  userId: string;
  displayName: string;
}

export type StaffLoginParsed =
  | { ok: true; sessionToken: string; account: StaffLoginAccount }
  | { ok: false; errorCode: string };

/**
 * Normalize the `/api/staff/login` envelope response into a typed result. Pure so
 * the modal's success/failure branches (saveStaffSession vs. keep-draft error) are
 * unit-testable without a live server. NEVER logs the token or the login code.
 */
export function parseStaffLoginResponse(res: { ok: boolean }, json: unknown): StaffLoginParsed {
  const j = json as { ok?: boolean; data?: { sessionToken?: unknown; account?: unknown }; error?: unknown } | null;
  const token = j?.data?.sessionToken;
  const account = j?.data?.account as { accountId?: unknown; userId?: unknown; displayName?: unknown } | undefined;
  if (
    res.ok &&
    j?.ok === true &&
    typeof token === 'string' &&
    token.trim() &&
    account &&
    typeof account.accountId === 'string' &&
    typeof account.userId === 'string'
  ) {
    return {
      ok: true,
      sessionToken: token,
      account: {
        accountId: account.accountId,
        userId: account.userId,
        displayName: typeof account.displayName === 'string' ? account.displayName : '',
      },
    };
  }
  const errorCode = typeof j?.error === 'string' ? j.error : 'STAFF_LOGIN_FAILED';
  return { ok: false, errorCode };
}

/**
 * Map a login error code to a user-facing Korean message. Generic on purpose —
 * never leaks internal DB state (e.g. whether an account exists). Both a wrong
 * code and an unknown account read as "코드가 올바르지 않습니다.".
 */
export function staffLoginErrorMessage(code: string | undefined): string {
  switch (code) {
    case 'LOGIN_LOCKED':
      return '시도가 많아 잠시 잠겼습니다. 잠시 후 다시 시도해 주세요.';
    case 'ACCOUNT_DEACTIVATED':
      return '비활성화된 계정입니다. 관리자에게 문의하세요.';
    case 'STAFF_LOGIN_ROSTER_FAILED':
    case 'STAFF_LOGIN_FAILED':
      return '로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.';
    default:
      return '코드가 올바르지 않습니다.';
  }
}
