import { isUuid } from '@/lib/ops-events/guard';

/** Canonical default room id (migration seed + server fallback). */
export const SEEDED_DEFAULT_CHAT_ROOM_ID = '00000000-0000-0000-0000-000000000001';

/** Seed collision check only — not used as a permanent room identifier. */
export const SEEDED_DEFAULT_CHAT_ROOM_NAME = '청소팀 단체방';

export class DefaultChatRoomConfigError extends Error {
  constructor(
    public readonly code: 'DEFAULT_CHAT_ROOM_ID_MISMATCH' | 'NEXT_PUBLIC_DEFAULT_CHAT_ROOM_ID_MISMATCH'
  ) {
    super(code);
    this.name = 'DefaultChatRoomConfigError';
  }
}

type DefaultRoomEnv = {
  DEFAULT_CHAT_ROOM_ID?: string;
  NEXT_PUBLIC_DEFAULT_CHAT_ROOM_ID?: string;
};

/** Pure env resolution for tests and runtime. Env UUID must match seed or request fails. */
export function resolveDefaultChatRoomIdFromEnv(env: DefaultRoomEnv): string {
  const fromServer = env.DEFAULT_CHAT_ROOM_ID?.trim();
  if (fromServer) {
    if (!isUuid(fromServer)) {
      throw new DefaultChatRoomConfigError('DEFAULT_CHAT_ROOM_ID_MISMATCH');
    }
    if (fromServer !== SEEDED_DEFAULT_CHAT_ROOM_ID) {
      throw new DefaultChatRoomConfigError('DEFAULT_CHAT_ROOM_ID_MISMATCH');
    }
    return fromServer;
  }

  const fromPublic = env.NEXT_PUBLIC_DEFAULT_CHAT_ROOM_ID?.trim();
  if (fromPublic) {
    if (!isUuid(fromPublic)) {
      throw new DefaultChatRoomConfigError('NEXT_PUBLIC_DEFAULT_CHAT_ROOM_ID_MISMATCH');
    }
    if (fromPublic !== SEEDED_DEFAULT_CHAT_ROOM_ID) {
      throw new DefaultChatRoomConfigError('NEXT_PUBLIC_DEFAULT_CHAT_ROOM_ID_MISMATCH');
    }
    return fromPublic;
  }

  return SEEDED_DEFAULT_CHAT_ROOM_ID;
}

export function resolveDefaultChatRoomId(): string {
  return resolveDefaultChatRoomIdFromEnv(process.env as DefaultRoomEnv);
}

/** Normalize optional chat room id from API fields (`chat_room_id` wins over `chatRoomId`). */
export function parseOptionalChatRoomId(
  chat_room_id: string | null | undefined,
  chatRoomId: string | null | undefined
): string | null {
  const primary = String(chat_room_id ?? '').trim();
  if (primary) return primary;
  const alias = String(chatRoomId ?? '').trim();
  return alias || null;
}
