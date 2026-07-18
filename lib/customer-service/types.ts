// Phase 1A — Customer Service Channel data contract (types).
//
// This channel is PHYSICALLY separate from the existing staff chat_messages model
// (lib/types.ts ChatMessage). Do not mix the two. See
// docs/customer-service/channel-contract.md.

/** Tenant boundary. Server-decided; never trusted from client input. */
export type SiteId = string;

/** BCP-47 language code, e.g. 'ko', 'en', 'ru', 'zh-CN', 'ja'. */
export type LangCode = string;

export type StayStatus = 'active' | 'checked_out' | 'revoked';
export type ConversationStatus = 'open' | 'closed';

/** Server-forced. Guest API always sets 'guest'; staff API sets 'staff'/'system'. */
export type CustomerSenderType = 'guest' | 'staff' | 'system';

/** Guests may only ever author/read 'public'. 'internal' is staff/system only. */
export type MessageVisibility = 'public' | 'internal';

export type CustomerMessageType = 'text' | 'image' | 'system';

export type TranslationStatus = 'not_requested' | 'pending' | 'completed' | 'failed';

export type AccessTokenStatus = 'active' | 'revoked' | 'expired';

export type ReaderType = 'guest' | 'staff';

/** BCP-47 keyed translation map. Superset of the staff chat 2-letter TranslatedText. */
export type TranslatedTextMap = Record<LangCode, string>;

export interface CustomerStay {
  id: string;
  site_id: SiteId;
  room_no: string;
  guest_language: LangCode;
  status: StayStatus;
  checkin_at: string;
  checkout_at: string | null;
  external_reservation_id: string | null;
  guest_display_name: string | null;
  guest_phone_masked: string | null;
  created_at: string;
  updated_at: string;
}

export interface CustomerConversation {
  id: string;
  site_id: SiteId;
  stay_id: string;
  status: ConversationStatus;
  guest_language: LangCode;
  room_no_snapshot: string | null;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CustomerMessage {
  id: string;
  site_id: SiteId;
  conversation_id: string;
  sender_type: CustomerSenderType;
  sender_staff_user_id: string | null;
  visibility: MessageVisibility;
  message_type: CustomerMessageType;
  original_text: string | null;
  original_language: LangCode | null;
  translated_text: TranslatedTextMap;
  translation_status: TranslationStatus;
  translation_provider: string | null;
  translation_error: string | null;
  translated_at: string | null;
  image_storage_path: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/** DB row for a token (hash only). Raw token is never persisted. */
export interface CustomerAccessTokenRow {
  id: string;
  site_id: SiteId;
  stay_id: string;
  conversation_id: string;
  token_hash: string;
  status: AccessTokenStatus;
  expires_at: string;
  revoked_at: string | null;
  last_used_at: string | null;
  created_at: string;
}

/**
 * Server-decided guest session, produced ONLY by validateCustomerAccessToken.
 * Everything a downstream handler is allowed to trust about a guest lives here —
 * derived from the token, never from client-supplied room_no/conversation_id.
 */
export interface GuestSessionContext {
  site_id: SiteId;
  stay_id: string;
  conversation_id: string;
  token_id: string;
}

/**
 * Verified staff context. In 1A this must be supplied by an already-authenticated
 * staff server route; wiring it to the real staff session is Phase 1B (see auth.ts).
 */
export interface StaffContext {
  site_id: SiteId;
  staff_user_id: string;
}
