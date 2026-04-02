import type { ChatMessage } from '@/lib/types';

/**
 * ChatMessage 행 판별은 **`id` 필드만** 사용합니다.
 * 본문 필드명도 `message`(string)이므로 `row.message`로 타입을 추론하지 않습니다.
 */
function readNonEmptyId(row: Record<string, unknown>): string | null {
  const raw = row.id;
  if (typeof raw === 'string' && raw.trim().length > 0) return raw;
  if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw);
  return null;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * POST /api/chat/send 성공 시 `fetchEnvelope`의 `data`만 전달.
 * 표준: `{ message: ChatMessage }`
 * 레거시: `data`가 ChatMessage 행 하나인 경우
 *
 * 반환값이 non-null이면 **`id`는 항상 비어 있지 않은 string**입니다.
 */
export function unwrapChatSendEnvelopeData(data: unknown): ChatMessage | null {
  if (!isPlainObject(data)) return null;

  const msgCandidate = data.message;
  if (isPlainObject(msgCandidate)) {
    const id = readNonEmptyId(msgCandidate);
    if (!id) return null;
    return { ...(msgCandidate as object), id } as ChatMessage;
  }

  const id = readNonEmptyId(data);
  if (!id) return null;
  if (typeof data.user_id !== 'string') return null;
  return { ...(data as object), id } as ChatMessage;
}
