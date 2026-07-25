// Pure helpers for staff "대화 종료" DELETE response handling (unit-testable, no fetch/@ alias).

export type CloseSessionResult = {
  closed: boolean;
  closed_count: number;
  closed_session_ids: string[];
};

/** Non-2xx → throw. Never embed response body (tokens/details) in the Error message. */
export function parseCloseSessionHttpResult(status: number, body: unknown): CloseSessionResult {
  if (status < 200 || status >= 300) {
    throw new Error(`CLOSE_SESSION_FAILED_${status}`);
  }
  const b = (body && typeof body === 'object' ? body : {}) as {
    closed?: boolean;
    closed_count?: number;
    closed_session_ids?: unknown;
  };
  const closed_count = typeof b.closed_count === 'number' ? b.closed_count : 0;
  return {
    closed: typeof b.closed === 'boolean' ? b.closed : closed_count > 0,
    closed_count,
    closed_session_ids: Array.isArray(b.closed_session_ids) ? b.closed_session_ids.map(String) : [],
  };
}

/** Safe staff-facing copy when close fails (no internal details). */
export const CLOSE_SESSION_FAILED_USER_MESSAGE =
  '대화를 종료하지 못했습니다.\n네트워크 또는 로그인 상태를 확인한 뒤 다시 시도해 주세요.';
