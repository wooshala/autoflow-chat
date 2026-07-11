export type UserRole = 'admin' | 'front' | 'cleaning';
export type UserLanguage = 'ko' | 'vi' | 'ru' | 'en';
export type MessageType = 'text' | 'image' | 'maintenance';
export type SenderSide = 'pc' | 'mobile';
export type AiAction =
  | 'ticket_created'
  | 'ticket_created_manual'
  | 'ticket_linked_existing'
  | 'note_saved'
  | 'skip_duplicate'
  | 'skip_not_ticketable'
  | 'skip_review_required'
  | 'skip_no_room'
  | 'skip_ai_error'
  | null;

/** Chat → ticket automation (intent) */
export type MessageIntentIssueType =
  | 'housekeeping'
  | 'maintenance'
  | 'frontdesk'
  | 'checkout'
  | 'payment'
  | 'ops_note';

export interface MessageIntent {
  id: string;
  message_id: string;
  room_no: string | null;
  issue_type: MessageIntentIssueType;
  summary: string | null;
  is_ticketable: boolean;
  is_new_issue: boolean;
  matched_ticket_id: string | null;
  confidence: number | null;
  raw_ai_result: unknown | null;
  created_at: string;
}
export type TicketStatus = 'open' | 'progress' | 'done';
export type IssueType = '설비' | '전기' | '가전' | '침구' | '청소' | '기타';
export type PhotoType = 'before' | 'after';

/** 채팅방 내 참가자 역할 (권한 enforcement는 API/RLS 후속) */
export type ChatRoomParticipantRole = 'owner' | 'admin' | 'member';

/** 참가자 멤버십 상태 (removed = soft leave) */
export type ChatRoomParticipantStatus = 'active' | 'removed';

export interface ChatRoom {
  id: string;
  name: string;
  created_at: string;
}

export interface ChatRoomParticipant {
  id: string;
  room_id: string;
  user_id: string;
  role: ChatRoomParticipantRole;
  status: ChatRoomParticipantStatus;
  joined_at: string;
  removed_at: string | null;
  user?: Pick<User, 'id' | 'name' | 'role' | 'language'>;
}

/** GET /api/chat/rooms/:roomId/participants 응답 항목 */
export interface ChatRoomParticipantListItem {
  user_id: string;
  name: string;
  role: ChatRoomParticipantRole;
  joined_at: string;
}

export interface User {
  id: string;
  name: string;
  role: UserRole;
  language: UserLanguage;
  pin?: string;
  created_at: string;
}

export interface TranslatedText {
  ko?: string;
  vi?: string;
  ru?: string;
  en?: string;
  zh?: string;
  th?: string;
}

export type MessagePriority = 'normal' | 'urgent';

export interface ChatQuickPhrase {
  id: string;
  site_id: string;
  phrase_key: string;
  ko: string;
  ru: string;
  sort_order: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface StaffInvite {
  id: string;
  site_id: string;
  token: string;
  display_name: string;
  role: string;
  user_id: string | null;
  spoken_lang?: string | null;
  enabled: boolean;
  created_at: string;
  last_seen_at: string | null;
  revoked_at?: string | null;
  device_key?: string | null;
  /** Work status (operational). Optional until the DB migration is applied. */
  current_status?: string | null;
  status_updated_at?: string | null;
}

export interface StaffEntryInvite {
  id: string;
  site_id: string;
  token: string;
  status: 'active' | 'revoked';
  created_at: string;
  revoked_at: string | null;
}

export interface ChatMessage {
  id: string;
  user_id: string;
  message: string;
  message_type: MessageType;
  priority?: MessagePriority | null;
  phrase_key?: string | null;
  sender_name?: string | null;
  token_id?: string | null;
  /** 메신저 채팅방 (chat_rooms.id). Phase 1A: nullable until migration backfill completes. */
  chat_room_id: string | null;
  /** 호텔 객실번호 메타데이터 (채팅방 ID가 아님). */
  room_no: string | null;
  image_url: string | null;
  image_storage_path: string | null;
  original_lang: string;
  translated_text: TranslatedText | null;
  back_translated_text?: TranslatedText | null;
  ticket_id: string | null;
  duplicate_ticket_id?: string | null;
  ai_action?: AiAction;
  sender_side?: SenderSide | null;
  is_deleted?: boolean;
  deleted_at?: string | null;
  deleted_by?: string | null;
  deleted_reason?: DeletedReason | null;
  created_at: string;
  user?: Pick<User, 'id' | 'name' | 'role' | 'language'>;
}

export type DeletedReason = 'owner' | 'admin';

export interface MaintenancePhoto {
  id: string;
  ticket_id: string;
  image_url: string;
  storage_path: string | null;
  photo_type: PhotoType;
  created_at: string;
}

export interface MaintenanceTicket {
  id: string;
  room_no: string;
  issue_type: IssueType;
  description: string;
  status: TicketStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
  creator?: Pick<User, 'id' | 'name' | 'role' | 'language'>;
  photos?: MaintenancePhoto[];
}

// ── Rooms ────────────────────────────────────────────────────────────────────

export type RoomStatus = 'vacant' | 'occupied' | 'cleaning';

export interface Room {
  id: string;
  room_no: string;
  floor: string | null;
  status: RoomStatus;
  notes: string | null;
  created_at: string;
}

// ── Room timeline (composed read view) ───────────────────────────────────────

export type TimelineSourceType = 'intent' | 'ticket' | 'queue';
export type TimelineSeverity = 'urgent' | 'high' | 'normal';

export interface TimelineEvent {
  room_no: string;
  occurred_at: string;
  source_type: TimelineSourceType;
  event_type: string;
  summary: string;
  severity: TimelineSeverity;
  reference_id: string;
  meta: Record<string, unknown> | null;
}

export const ISSUE_TYPES: IssueType[] = ['설비', '전기', '가전', '침구', '청소', '기타'];

export const ISSUE_UI: Record<IssueType, { emoji: string; badge: string }> = {
  설비: { emoji: '🚿', badge: 'bg-red-100 text-red-700' },
  전기: { emoji: '⚡', badge: 'bg-yellow-100 text-yellow-800' },
  가전: { emoji: '📺', badge: 'bg-orange-100 text-orange-700' },
  침구: { emoji: '🛏️', badge: 'bg-blue-100 text-blue-700' },
  청소: { emoji: '🧹', badge: 'bg-green-100 text-green-700' },
  기타: { emoji: '❓', badge: 'bg-gray-100 text-gray-700' }
};

export const STATUS_UI: Record<TicketStatus, { label: string; badge: string }> = {
  open: { label: '대기중', badge: 'bg-red-100 text-red-700' },
  progress: { label: '처리중', badge: 'bg-yellow-100 text-yellow-800' },
  done: { label: '완료', badge: 'bg-green-100 text-green-700' }
};
