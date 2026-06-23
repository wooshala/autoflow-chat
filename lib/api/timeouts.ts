/**
 * 클라이언트 fetch 타임아웃 정책 (ms). fetchEnvelope(timeoutMs)에 명시적으로 전달.
 */

/** GET /api/chat/list — 진단·지연 대비 (30~60초 권장 구간) */
export const TIMEOUT_MS_CHAT_LIST = 45_000;

/** POST /api/chat/send — OpenAI forward + back-translate (2× ~12s) */
export const TIMEOUT_MS_CHAT_SEND = 35_000;

/** GET /api/chat/rooms/:id/participants */
export const TIMEOUT_MS_PARTICIPANTS = 10_000;

/** min-chat list (list 계열과 동일 정책) */
export const TIMEOUT_MS_CHAT_LIST_MIN = 45_000;

/** min-chat send */
export const TIMEOUT_MS_CHAT_SEND_MIN = 15_000;

/** 삭제·수동 티켓 연결 등 채팅 보조 API */
export const TIMEOUT_MS_CHAT_AUX = 15_000;

/** 유지보수 생성(이미지 업로드 가능) */
export const TIMEOUT_MS_MAINTENANCE_CREATE = 60_000;

/** 로그인 */
export const TIMEOUT_MS_AUTH_LOGIN = 15_000;

/** 대시보드·유지보수 목록 등 일반 JSON API */
export const TIMEOUT_MS_DASHBOARD = 30_000;
