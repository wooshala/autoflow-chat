/**
 * Phase 1.2.6 D: get_chat_room_last_messages RPC 오류가 "함수 미존재(마이그레이션 미적용)"인지 판별.
 * 이것만 기대된 폴백 사유(legacy로 degrade). 그 외(권한 42501 / 타임아웃 / 파라미터 /
 * malformed / 예상 밖 PostgREST)는 실제 결함 → error 로깅 대상. 순수 함수(테스트 대상).
 */
export function isChatRoomLastMessagesFunctionMissing(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown };
  const code = String(e.code ?? '');
  // PostgREST: 스키마 캐시에 함수 없음. Postgres: undefined_function.
  if (code === 'PGRST202' || code === '42883') return true;
  const text = `${String(e.message ?? '')} ${String(e.details ?? '')} ${String(e.hint ?? '')}`.toLowerCase();
  return (
    text.includes('could not find the function') ||
    // "function ... does not exist" 한정(“column ... does not exist” 등 실제 결함 오분류 방지).
    (text.includes('function') && text.includes('does not exist')) ||
    text.includes('schema cache')
  );
}
