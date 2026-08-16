/**
 * Pure ownership + soft-delete decision for guest_chat_messages.
 * Import-free — unit-testable without DB.
 */

export type GuestDeleteActor =
  | { kind: 'guest'; sessionId: string }
  | { kind: 'staff'; userId: string; role: string }

export type GuestDeleteReason = 'owner' | 'admin'

export type GuestMessageDeleteRow = {
  id: string
  channel_key: string
  session_id: string | null
  sender: 'guest' | 'staff'
  is_deleted: boolean
  staff_user_id: string | null
}

export type GuestDeleteDecision =
  | { ok: true; reason: GuestDeleteReason; alreadyDeleted: boolean }
  | { ok: false; error: 'NOT_FOUND' | 'CHANNEL_MISMATCH' | 'FORBIDDEN' | 'NO_SESSION' }

function isAdminRole(role: unknown): boolean {
  const r = String(role ?? '').toLowerCase()
  return r === 'admin' || r === 'manager'
}

export function decideGuestMessageDelete(input: {
  message: GuestMessageDeleteRow | null
  channelKey: string
  actor: GuestDeleteActor
}): GuestDeleteDecision {
  const { message, channelKey, actor } = input
  if (!message) return { ok: false, error: 'NOT_FOUND' }
  if (String(message.channel_key) !== String(channelKey)) {
    return { ok: false, error: 'CHANNEL_MISMATCH' }
  }

  if (message.is_deleted) {
    // Idempotent success path — caller still returns the row.
    // Ownership still required so strangers cannot probe ids.
  }

  if (actor.kind === 'guest') {
    if (!actor.sessionId) return { ok: false, error: 'NO_SESSION' }
    if (!message.session_id || String(message.session_id) !== String(actor.sessionId)) {
      return { ok: false, error: 'FORBIDDEN' }
    }
    if (message.sender !== 'guest') return { ok: false, error: 'FORBIDDEN' }
    return { ok: true, reason: 'owner', alreadyDeleted: message.is_deleted === true }
  }

  // staff
  if (isAdminRole(actor.role)) {
    return { ok: true, reason: 'admin', alreadyDeleted: message.is_deleted === true }
  }
  if (message.sender !== 'staff') return { ok: false, error: 'FORBIDDEN' }
  // Own staff message: staff_user_id must match. Legacy null → only admin (above) may delete.
  if (!message.staff_user_id || String(message.staff_user_id) !== String(actor.userId)) {
    return { ok: false, error: 'FORBIDDEN' }
  }
  return { ok: true, reason: 'owner', alreadyDeleted: message.is_deleted === true }
}

/** Placeholder copy — keep identical to ops chat UX. */
export const GUEST_DELETED_MESSAGE_PLACEHOLDER = '삭제된 메시지입니다'
