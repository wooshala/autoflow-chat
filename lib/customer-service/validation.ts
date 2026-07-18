// Phase 1A — runtime validation (hand-rolled; zod is not a dependency).
//
// Every value that reaches the repository is validated here. The repository never
// trusts caller-supplied sender_type/visibility as free strings — the append*
// functions choose those server-side, and these validators guard the rest.

import type {
  AccessTokenStatus,
  ConversationStatus,
  CustomerMessageType,
  CustomerSenderType,
  MessageVisibility,
  ReaderType,
  StayStatus,
  TranslationStatus,
} from './types';

export class CustomerChannelValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CustomerChannelValidationError';
  }
}

function fail(msg: string): never {
  throw new CustomerChannelValidationError(msg);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX64_RE = /^[0-9a-f]{64}$/i;

export function assertUuid(v: unknown, field: string): string {
  if (typeof v !== 'string' || !UUID_RE.test(v)) fail(`${field} must be a uuid`);
  return v as string;
}

export function assertTokenHash(v: unknown): string {
  if (typeof v !== 'string' || !HEX64_RE.test(v)) fail('token_hash must be a 64-char hex sha-256');
  return v;
}

export function assertSiteId(v: unknown): string {
  if (typeof v !== 'string') fail('site_id must be a string');
  const s = v.trim();
  if (s.length < 1 || s.length > 64) fail('site_id length out of range');
  return s;
}

export function assertRoomNo(v: unknown): string {
  if (typeof v !== 'string') fail('room_no must be a string');
  const s = v.trim();
  if (s.length < 1 || s.length > 32) fail('room_no length out of range');
  return s;
}

export function assertLangCode(v: unknown, field = 'language'): string {
  // BCP-47-ish: 2-3 letter primary subtag, optional region/script. Kept permissive.
  if (typeof v !== 'string' || !/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(v)) {
    fail(`${field} must be a BCP-47 code`);
  }
  return v;
}

export function assertMessageText(v: unknown): string {
  if (typeof v !== 'string') fail('message text must be a string');
  const s = v;
  if (s.trim().length === 0) fail('message text must not be empty');
  if (s.length > 4000) fail('message text too long (max 4000)');
  return s;
}

function assertEnum<T extends string>(v: unknown, allowed: readonly T[], field: string): T {
  if (typeof v !== 'string' || !allowed.includes(v as T)) {
    fail(`${field} must be one of: ${allowed.join(', ')}`);
  }
  return v as T;
}

export const assertStayStatus = (v: unknown): StayStatus =>
  assertEnum(v, ['active', 'checked_out', 'revoked'] as const, 'status');
export const assertConversationStatus = (v: unknown): ConversationStatus =>
  assertEnum(v, ['open', 'closed'] as const, 'status');
export const assertSenderType = (v: unknown): CustomerSenderType =>
  assertEnum(v, ['guest', 'staff', 'system'] as const, 'sender_type');
export const assertVisibility = (v: unknown): MessageVisibility =>
  assertEnum(v, ['public', 'internal'] as const, 'visibility');
export const assertMessageType = (v: unknown): CustomerMessageType =>
  assertEnum(v, ['text', 'image', 'system'] as const, 'message_type');
export const assertTranslationStatus = (v: unknown): TranslationStatus =>
  assertEnum(v, ['not_requested', 'pending', 'completed', 'failed'] as const, 'translation_status');
export const assertTokenStatus = (v: unknown): AccessTokenStatus =>
  assertEnum(v, ['active', 'revoked', 'expired'] as const, 'token status');
export const assertReaderType = (v: unknown): ReaderType =>
  assertEnum(v, ['guest', 'staff'] as const, 'reader_type');

/**
 * The core invariant, enforced in code (and mirrored by DB CHECK constraints):
 * a guest sender may only produce a public message.
 */
export function assertGuestPublicInvariant(
  senderType: CustomerSenderType,
  visibility: MessageVisibility,
): void {
  if (senderType === 'guest' && visibility !== 'public') {
    fail('guest messages must be public');
  }
  if (visibility === 'internal' && senderType === 'guest') {
    fail('internal messages may not be authored by a guest');
  }
}
