export type UserRole = 'admin' | 'front' | 'cleaning';
export type UserLanguage = 'ko' | 'vi' | 'ru' | 'en';
export type MessageType = 'text' | 'image' | 'maintenance';
export type TicketStatus = 'open' | 'progress' | 'done';
export type IssueType = '설비' | '전기' | '가전' | '침구' | '청소';
export type PhotoType = 'before' | 'after';

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
}

export interface ChatMessage {
  id: string;
  user_id: string;
  message: string;
  message_type: MessageType;
  room_no: string | null;
  image_url: string | null;
  image_storage_path: string | null;
  original_lang: string;
  translated_text: TranslatedText | null;
  ticket_id: string | null;
  created_at: string;
  user?: Pick<User, 'id' | 'name' | 'role' | 'language'>;
}

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

export const ISSUE_TYPES: IssueType[] = ['설비', '전기', '가전', '침구', '청소'];

export const ISSUE_UI: Record<IssueType, { emoji: string; badge: string }> = {
  설비: { emoji: '🚿', badge: 'bg-red-100 text-red-700' },
  전기: { emoji: '⚡', badge: 'bg-yellow-100 text-yellow-800' },
  가전: { emoji: '📺', badge: 'bg-orange-100 text-orange-700' },
  침구: { emoji: '🛏️', badge: 'bg-blue-100 text-blue-700' },
  청소: { emoji: '🧹', badge: 'bg-green-100 text-green-700' }
};

export const STATUS_UI: Record<TicketStatus, { label: string; badge: string }> = {
  open: { label: '대기중', badge: 'bg-red-100 text-red-700' },
  progress: { label: '처리중', badge: 'bg-yellow-100 text-yellow-800' },
  done: { label: '완료', badge: 'bg-green-100 text-green-700' }
};
