// Phase 1A — customer-service channel repository (server-only, service_role).
//
// This is the ONLY sanctioned data path for the customer channel. It:
//   * uses the server service_role client (lib/supabase supabaseAdmin) — never the
//     browser anon key. Do not import this from a client component.
//   * FORCES sender_type/visibility server-side via distinct append* functions.
//     There is intentionally no generic insertMessage({sender_type, visibility}).
//   * derives a guest's conversation_id/site_id from the validated token session,
//     never from client-supplied room_no/conversation_id.
//   * enforces the tenant (site_id) on every staff write.
//   * never writes to chat_messages / staff_* / the stay-journal DB.
//   * preserves original text; translations are attached separately and never
//     overwrite original_text/original_language.

import { supabaseAdmin } from '../supabase';
import {
  generateRawCustomerToken,
  hashCustomerToken,
} from './token';
import {
  assertLangCode,
  assertMessageText,
  assertMessageType,
  assertRoomNo,
  assertSiteId,
  assertUuid,
  CustomerChannelValidationError,
} from './validation';
import { requireGuestSession, requireStaffContext } from './auth';
import type {
  CustomerConversation,
  CustomerMessage,
  CustomerMessageType,
  CustomerStay,
  GuestSessionContext,
  LangCode,
  StaffContext,
  TranslatedTextMap,
} from './types';

type Db = NonNullable<typeof supabaseAdmin>;

function db(): Db {
  if (!supabaseAdmin) {
    throw new Error('customer-service repository requires the server service_role client');
  }
  return supabaseAdmin as Db;
}

// ── stays ─────────────────────────────────────────────────────────────────────

export async function createCustomerStay(input: {
  site_id: string;
  room_no: string;
  guest_language?: LangCode;
  guest_display_name?: string | null;
  external_reservation_id?: string | null;
}): Promise<CustomerStay> {
  const row = {
    site_id: assertSiteId(input.site_id),
    room_no: assertRoomNo(input.room_no),
    guest_language: assertLangCode(input.guest_language ?? 'en', 'guest_language'),
    guest_display_name: input.guest_display_name ?? null,
    external_reservation_id: input.external_reservation_id ?? null,
  };
  const { data, error } = await db().from('customer_stays').insert(row).select('*').single();
  if (error) throw new Error(`createCustomerStay failed: ${error.message}`);
  return data as CustomerStay;
}

// ── conversations ──────────────────────────────────────────────────────────────

export async function createCustomerConversation(input: {
  site_id: string;
  stay_id: string;
  guest_language?: LangCode;
  room_no_snapshot?: string | null;
}): Promise<CustomerConversation> {
  const row = {
    site_id: assertSiteId(input.site_id),
    stay_id: assertUuid(input.stay_id, 'stay_id'),
    guest_language: assertLangCode(input.guest_language ?? 'en', 'guest_language'),
    room_no_snapshot: input.room_no_snapshot ?? null,
  };
  const { data, error } = await db()
    .from('customer_conversations')
    .insert(row)
    .select('*')
    .single();
  if (error) throw new Error(`createCustomerConversation failed: ${error.message}`);
  return data as CustomerConversation;
}

// ── access tokens ─────────────────────────────────────────────────────────────

/**
 * Mint a guest access token. Returns the RAW token ONCE (embed in an opaque URL);
 * only its hash is stored. The raw token is never persisted or logged here.
 */
export async function issueCustomerAccessToken(input: {
  site_id: string;
  stay_id: string;
  conversation_id: string;
  ttlHours?: number;
}): Promise<{ rawToken: string; tokenId: string; expiresAt: string }> {
  const site_id = assertSiteId(input.site_id);
  const stay_id = assertUuid(input.stay_id, 'stay_id');
  const conversation_id = assertUuid(input.conversation_id, 'conversation_id');
  const ttlHours = input.ttlHours && input.ttlHours > 0 ? input.ttlHours : 24;

  const rawToken = generateRawCustomerToken();
  const token_hash = hashCustomerToken(rawToken);
  const expires_at = new Date(Date.now() + ttlHours * 3600_000).toISOString();

  const { data, error } = await db()
    .from('customer_access_tokens')
    .insert({ site_id, stay_id, conversation_id, token_hash, status: 'active', expires_at })
    .select('id, expires_at')
    .single();
  if (error) throw new Error(`issueCustomerAccessToken failed: ${error.message}`);
  return { rawToken, tokenId: (data as { id: string }).id, expiresAt: expires_at };
}

/**
 * Validate a raw token → server-decided GuestSessionContext, or null on ANY failure
 * (not found / revoked / expired). Returns no reason to the caller (no info leak).
 * The conversation/site are taken from the token row, never from client input.
 */
export async function validateCustomerAccessToken(
  rawToken: string,
): Promise<GuestSessionContext | null> {
  if (typeof rawToken !== 'string' || rawToken.length < 16) return null;
  const token_hash = hashCustomerToken(rawToken);

  const { data, error } = await db()
    .from('customer_access_tokens')
    .select('id, site_id, stay_id, conversation_id, status, expires_at, revoked_at')
    .eq('token_hash', token_hash)
    .maybeSingle();
  if (error || !data) return null;

  const t = data as {
    id: string;
    site_id: string;
    stay_id: string;
    conversation_id: string;
    status: string;
    expires_at: string;
    revoked_at: string | null;
  };
  if (t.status !== 'active') return null;
  if (t.revoked_at) return null;
  if (new Date(t.expires_at).getTime() <= Date.now()) return null;

  // best-effort touch; failure here must not grant/deny access
  await db()
    .from('customer_access_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', t.id);

  return {
    site_id: t.site_id,
    stay_id: t.stay_id,
    conversation_id: t.conversation_id,
    token_id: t.id,
  };
}

/** Instant revoke (e.g. checkout). Revokes by token id or by stay. */
export async function revokeCustomerAccessToken(
  by: { tokenId: string } | { stayId: string },
): Promise<void> {
  const patch = { status: 'revoked' as const, revoked_at: new Date().toISOString() };
  const q = db().from('customer_access_tokens').update(patch);
  const { error } =
    'tokenId' in by
      ? await q.eq('id', assertUuid(by.tokenId, 'tokenId'))
      : await q.eq('stay_id', assertUuid(by.stayId, 'stayId'));
  if (error) throw new Error(`revokeCustomerAccessToken failed: ${error.message}`);
}

// ── message reads ─────────────────────────────────────────────────────────────

const PUBLIC_MESSAGE_COLS =
  'id, conversation_id, sender_type, message_type, original_text, original_language, translated_text, translation_status, image_storage_path, created_at';

/**
 * Guest read path. Returns ONLY public, non-deleted messages of the guest's own
 * conversation. Internal memos are excluded here AND by DB predicate — a guest can
 * never see them. Scope comes from the validated session.
 */
export async function listCustomerPublicMessages(
  session: GuestSessionContext,
  opts?: { limit?: number },
): Promise<Partial<CustomerMessage>[]> {
  const s = requireGuestSession(session);
  const limit = Math.min(Math.max(opts?.limit ?? 100, 1), 200);
  const { data, error } = await db()
    .from('customer_messages')
    .select(PUBLIC_MESSAGE_COLS)
    .eq('conversation_id', s.conversation_id)
    .eq('site_id', s.site_id)
    .eq('visibility', 'public')
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) throw new Error(`listCustomerPublicMessages failed: ${error.message}`);
  return (data ?? []) as Partial<CustomerMessage>[];
}

// ── message writes (server-forced sender_type/visibility) ──────────────────────

async function loadConversationForTenant(
  conversationId: string,
  siteId: string,
): Promise<CustomerConversation> {
  const { data, error } = await db()
    .from('customer_conversations')
    .select('*')
    .eq('id', assertUuid(conversationId, 'conversation_id'))
    .maybeSingle();
  if (error) throw new Error(`loadConversation failed: ${error.message}`);
  if (!data) throw new CustomerChannelValidationError('conversation not found');
  const c = data as CustomerConversation;
  if (c.site_id !== siteId) {
    // cross-tenant access attempt
    throw new CustomerChannelValidationError('conversation belongs to a different tenant');
  }
  return c;
}

async function insertMessageInternal(row: {
  site_id: string;
  conversation_id: string;
  sender_type: 'guest' | 'staff' | 'system';
  visibility: 'public' | 'internal';
  message_type: CustomerMessageType;
  sender_staff_user_id: string | null;
  original_text: string | null;
  original_language: LangCode | null;
  image_storage_path?: string | null;
}): Promise<CustomerMessage> {
  const { data, error } = await db()
    .from('customer_messages')
    .insert({
      ...row,
      image_storage_path: row.image_storage_path ?? null,
      translated_text: {},
      translation_status: 'not_requested',
    })
    .select('*')
    .single();
  if (error) throw new Error(`insertMessage failed: ${error.message}`);
  await db()
    .from('customer_conversations')
    .update({ last_message_at: (data as CustomerMessage).created_at })
    .eq('id', row.conversation_id);
  return data as CustomerMessage;
}

/** GUEST → always public, always sender_type='guest'. Scope from the token session. */
export async function appendGuestPublicMessage(
  session: GuestSessionContext,
  input: { text: string; language?: LangCode; message_type?: CustomerMessageType },
): Promise<CustomerMessage> {
  const s = requireGuestSession(session);
  const messageType = input.message_type ? assertMessageType(input.message_type) : 'text';
  if (messageType === 'system') {
    throw new CustomerChannelValidationError('guest may not send a system message');
  }
  return insertMessageInternal({
    site_id: s.site_id,
    conversation_id: s.conversation_id,
    sender_type: 'guest',
    visibility: 'public',
    message_type: messageType,
    sender_staff_user_id: null,
    original_text: assertMessageText(input.text),
    original_language: input.language ? assertLangCode(input.language) : null,
    image_storage_path: null,
  });
}

/** STAFF → public reply visible to the guest. Requires verified staff context + tenant. */
export async function appendStaffPublicMessage(
  staff: StaffContext,
  conversationId: string,
  input: { text: string; language?: LangCode; message_type?: CustomerMessageType },
): Promise<CustomerMessage> {
  const ctx = requireStaffContext(staff);
  const conv = await loadConversationForTenant(conversationId, ctx.site_id);
  const messageType = input.message_type ? assertMessageType(input.message_type) : 'text';
  return insertMessageInternal({
    site_id: ctx.site_id,
    conversation_id: conv.id,
    sender_type: 'staff',
    visibility: 'public',
    message_type: messageType,
    sender_staff_user_id: ctx.staff_user_id,
    original_text: assertMessageText(input.text),
    original_language: input.language ? assertLangCode(input.language) : null,
  });
}

/** STAFF → internal memo. Guest can NEVER read this (visibility='internal'). */
export async function appendStaffInternalMessage(
  staff: StaffContext,
  conversationId: string,
  input: { text: string; language?: LangCode },
): Promise<CustomerMessage> {
  const ctx = requireStaffContext(staff);
  const conv = await loadConversationForTenant(conversationId, ctx.site_id);
  return insertMessageInternal({
    site_id: ctx.site_id,
    conversation_id: conv.id,
    sender_type: 'staff',
    visibility: 'internal',
    message_type: 'text',
    sender_staff_user_id: ctx.staff_user_id,
    original_text: assertMessageText(input.text),
    original_language: input.language ? assertLangCode(input.language) : null,
  });
}

/**
 * Attach a translation to an existing message WITHOUT touching original_text /
 * original_language (contract: original is never overwritten). Phase 1A does not
 * call the translation API; this exists so the write path is proven original-safe.
 */
export async function attachMessageTranslation(input: {
  message_id: string;
  translated_text: TranslatedTextMap;
  provider: string;
}): Promise<void> {
  const { error } = await db()
    .from('customer_messages')
    .update({
      translated_text: input.translated_text,
      translation_status: 'completed',
      translation_provider: input.provider,
      translated_at: new Date().toISOString(),
    })
    .eq('id', assertUuid(input.message_id, 'message_id'));
  if (error) throw new Error(`attachMessageTranslation failed: ${error.message}`);
}

// ── read cursor ────────────────────────────────────────────────────────────────

/** Upsert a per-reader conversation read cursor (guest: single; staff: per user). */
export async function markConversationRead(
  reader:
    | { type: 'guest'; session: GuestSessionContext }
    | { type: 'staff'; staff: StaffContext; conversationId: string },
): Promise<void> {
  const now = new Date().toISOString();
  if (reader.type === 'guest') {
    const s = requireGuestSession(reader.session);
    const { error } = await db()
      .from('customer_conversation_read_state')
      .upsert(
        { conversation_id: s.conversation_id, reader_type: 'guest', staff_user_id: null, last_read_at: now },
        { onConflict: 'conversation_id', ignoreDuplicates: false },
      );
    if (error) throw new Error(`markConversationRead(guest) failed: ${error.message}`);
    return;
  }
  const ctx = requireStaffContext(reader.staff);
  const conv = await loadConversationForTenant(reader.conversationId, ctx.site_id);
  const { error } = await db()
    .from('customer_conversation_read_state')
    .upsert(
      {
        conversation_id: conv.id,
        reader_type: 'staff',
        staff_user_id: ctx.staff_user_id,
        last_read_at: now,
      },
      { onConflict: 'conversation_id,staff_user_id', ignoreDuplicates: false },
    );
  if (error) throw new Error(`markConversationRead(staff) failed: ${error.message}`);
}
