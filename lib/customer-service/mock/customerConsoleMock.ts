// Phase 1B — mock customer-service data for the console PoC.
//
// DEV/PoC ONLY. This data is never written to any DB, never mixed into the staff
// chat stream, and only reachable behind the customer-service console flag.
// It exercises: zh-CN/ja/en/ru, guest original + Korean translation, staff Korean +
// guest-language translation, an image message, a staff pasted-image reply, a
// translation failure, and an internal memo.

import type { CustomerLang } from '../translationLangs';

export type MockSenderType = 'guest' | 'staff' | 'system';
export type MockVisibility = 'public' | 'internal';
export type MockMessageType = 'text' | 'image' | 'system';

export interface MockMessage {
  id: string;
  sender_type: MockSenderType;
  visibility: MockVisibility;
  message_type: MockMessageType;
  original_text: string | null;
  original_language: CustomerLang | null;
  /** BCP-47 keyed translations; missing key = not translated (e.g. failure). */
  translated_text: Partial<Record<CustomerLang, string>>;
  translation_failed?: boolean;
  /** Mock only — a label standing in for a private image (no real URL). */
  image_label?: string;
  created_at: string; // ISO
}

export interface MockConversation {
  id: string;
  room_no: string;
  guest_language: CustomerLang;
  unread: number;
  messages: MockMessage[];
}

const T = (h: number, m: number) => `2026-07-18T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+09:00`;

export const MOCK_CONVERSATIONS: MockConversation[] = [
  {
    id: 'conv-zh-503',
    room_no: '503',
    guest_language: 'zh-CN',
    unread: 2,
    messages: [
      {
        id: 'm1',
        sender_type: 'guest',
        visibility: 'public',
        message_type: 'text',
        original_text: '我想延长住宿一晚，503房间，多少钱？',
        original_language: 'zh-CN',
        translated_text: { ko: '숙박을 하루 연장하고 싶어요. 503호, 얼마인가요?' },
        created_at: T(9, 12),
      },
      {
        id: 'm2',
        sender_type: 'staff',
        visibility: 'internal',
        message_type: 'text',
        original_text: '503 연박 가능 여부 확인 필요 (청소 배정)',
        original_language: 'ko',
        translated_text: {},
        created_at: T(9, 13),
      },
      {
        id: 'm3',
        sender_type: 'staff',
        visibility: 'public',
        message_type: 'text',
        original_text: '1박 연장 가능합니다. 1박 요금은 80,000원입니다.',
        original_language: 'ko',
        translated_text: { 'zh-CN': '可以延长1晚。每晚房费为80,000韩元。' },
        created_at: T(9, 15),
      },
    ],
  },
  {
    id: 'conv-ja-308',
    room_no: '308',
    guest_language: 'ja',
    unread: 1,
    messages: [
      {
        id: 'm4',
        sender_type: 'guest',
        visibility: 'public',
        message_type: 'text',
        original_text: '明日の朝7時にタクシーを1台お願いできますか。308号室です。',
        original_language: 'ja',
        translated_text: { ko: '내일 아침 7시에 택시 1대 부탁드릴 수 있을까요? 308호입니다.' },
        created_at: T(21, 40),
      },
    ],
  },
  {
    id: 'conv-en-606',
    room_no: '606',
    guest_language: 'en',
    unread: 0,
    messages: [
      {
        id: 'm5',
        sender_type: 'guest',
        visibility: 'public',
        message_type: 'text',
        original_text: 'Where is the nearest bus stop for the airport?',
        original_language: 'en',
        translated_text: { ko: '공항 가는 가장 가까운 버스정류장이 어디인가요?' },
        created_at: T(10, 2),
      },
      {
        id: 'm6',
        sender_type: 'guest',
        visibility: 'public',
        message_type: 'image',
        original_text: null,
        original_language: null,
        translated_text: {},
        image_label: '고객이 보낸 지도 캡처',
        created_at: T(10, 3),
      },
      {
        id: 'm7',
        sender_type: 'staff',
        visibility: 'public',
        message_type: 'image',
        original_text: '빨간색으로 표시한 정류장에서 3번 버스를 타세요.',
        original_language: 'ko',
        translated_text: { en: 'Please take bus number 3 from the stop marked in red.' },
        image_label: '직원이 붙여넣은 약도 캡처',
        created_at: T(10, 6),
      },
    ],
  },
  {
    id: 'conv-ru-205',
    room_no: '205',
    guest_language: 'ru',
    unread: 1,
    messages: [
      {
        id: 'm8',
        sender_type: 'guest',
        visibility: 'public',
        message_type: 'text',
        original_text: 'Где находится ближайший ресторан?',
        original_language: 'ru',
        translated_text: {}, // translation failure scenario
        translation_failed: true,
        created_at: T(19, 25),
      },
    ],
  },
];
