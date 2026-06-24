import type { StaffInviteSession } from '@/lib/auth/staffInviteSession';
import type { StaffUserKey } from '@/lib/auth/staffUsers';
import { staffKeyLabel } from '@/lib/auth/staffUsers';
import type { ChatMessage } from '@/lib/types';

export type StaffChatSessionIdentity = {
  currentUserId: string | null;
  currentTokenId: string | null;
  currentSenderName: string | null;
};

export function resolveStaffChatSessionIdentity(
  inviteSession: StaffInviteSession | null,
  legacy: { key: StaffUserKey; userId: string | null },
  sessionUserName: string | null
): StaffChatSessionIdentity {
  if (inviteSession) {
    return {
      currentUserId: inviteSession.userId,
      currentTokenId: inviteSession.inviteId,
      currentSenderName: inviteSession.displayName || sessionUserName || staffKeyLabel(legacy.key)
    };
  }
  return {
    currentUserId: legacy.userId,
    currentTokenId: null,
    currentSenderName: sessionUserName || staffKeyLabel(legacy.key)
  };
}

type SelfMessageFields = Pick<
  ChatMessage,
  'id' | 'user_id' | 'token_id' | 'sender_side' | 'sender_name'
>;

export function isStaffChatSelfMessage(
  message: SelfMessageFields,
  identity: StaffChatSessionIdentity
): boolean {
  const messageSenderId = message.user_id != null ? String(message.user_id) : null;
  const messageTokenId = message.token_id != null ? String(message.token_id) : null;
  const currentUserId = identity.currentUserId ? String(identity.currentUserId) : null;
  const currentTokenId = identity.currentTokenId ? String(identity.currentTokenId) : null;
  const senderName = message.sender_name != null ? String(message.sender_name) : null;

  const tokenMatch = Boolean(
    currentTokenId && messageTokenId && messageTokenId === currentTokenId
  );
  const userMatch = Boolean(
    currentUserId && messageSenderId && messageSenderId === currentUserId
  );

  let isSelf: boolean;
  if (identity.currentTokenId) {
    if (tokenMatch) {
      isSelf = true;
    } else if (message.sender_side === 'pc') {
      isSelf = false;
    } else {
      isSelf = userMatch && message.sender_side === 'mobile';
    }
  } else {
    isSelf = tokenMatch || userMatch;
  }

  console.log('[CHAT_SELF_CHECK]', {
    messageId: message.id != null ? String(message.id) : null,
    messageSenderId,
    messageTokenId,
    currentUserId,
    currentTokenId,
    senderName,
    isSelf
  });

  return isSelf;
}
