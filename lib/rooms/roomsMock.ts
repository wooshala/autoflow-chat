// Phase 1C — DEV/PoC room list + seeded customer conversations.
//
// DEV ONLY. Reachable only behind NEXT_PUBLIC_ROOM_NAVIGATION. Exactly ONE room is
// real ('직원 전체' → existing staff chat); every other room here is mock with NO DB
// write and is NOT mixed into the real staff stream. Customer message bodies reuse the
// Phase 1B mock content and add 701(ru)/502(zh) so §9 lists five customer rooms.

import type { CustomerLang } from '@/lib/customer-service/translationLangs';
import type { MockMessage } from '@/lib/customer-service/mock/customerConsoleMock';
import { STAFF_GLOBAL_ROOM_ID, type Room } from './roomTypes';

const T = (h: number, m: number) =>
  `2026-07-18T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+09:00`;

/** The one real, data-backed room. Selecting it renders the existing staff chat. */
export const STAFF_GLOBAL_ROOM: Room = {
  id: STAFF_GLOBAL_ROOM_ID,
  kind: 'staff-global',
  title: '직원 전체',
  team: 'general',
  isMine: true,
  isDev: false,
  lastActiveAt: T(10, 20),
};

/** DEV mock team rooms — no real team backing exists yet (§2). */
const STAFF_MOCK_ROOMS: Room[] = [
  { id: 'staff-cleaning', kind: 'staff-mock', title: '청소팀 전체', team: 'cleaning', isMine: true, isDev: true, unread: 2, lastActiveAt: T(10, 5) },
  { id: 'staff-front', kind: 'staff-mock', title: '프런트 전체', team: 'front', isMine: true, isDev: true, lastActiveAt: T(9, 50) },
  { id: 'staff-maintenance', kind: 'staff-mock', title: '정비팀 전체', team: 'maintenance', isDev: true, lastActiveAt: T(9, 10) },
];

const CUSTOMER_ROOMS: Room[] = [
  { id: 'cust-503', kind: 'customer', title: '503호 · 中文(简体)', room_no: '503', language: 'zh-CN', isMine: true, isDev: true, unread: 2, lastActiveAt: T(9, 15) },
  { id: 'cust-308', kind: 'customer', title: '308호 · 日本語', room_no: '308', language: 'ja', isMine: true, isDev: true, unread: 1, lastActiveAt: T(21, 40) },
  { id: 'cust-606', kind: 'customer', title: '606호 · English', room_no: '606', language: 'en', isDev: true, lastActiveAt: T(10, 6) },
  { id: 'cust-701', kind: 'customer', title: '701호 · Русский', room_no: '701', language: 'ru', isDev: true, unread: 1, lastActiveAt: T(19, 25) },
  { id: 'cust-502', kind: 'customer', title: '502호 · 中文(简体)', room_no: '502', language: 'zh-CN', isDev: true, lastActiveAt: T(8, 30) },
];

/** All seed rooms in nav order: real staff first, then DEV team rooms, then customers. */
export const MOCK_ROOMS: Room[] = [STAFF_GLOBAL_ROOM, ...STAFF_MOCK_ROOMS, ...CUSTOMER_ROOMS];

const g = (
  id: string,
  lang: CustomerLang,
  original: string,
  ko: string,
  at: string,
): MockMessage => ({
  id,
  sender_type: 'guest',
  visibility: 'public',
  message_type: 'text',
  original_text: original,
  original_language: lang,
  translated_text: { ko },
  created_at: at,
});

const s = (
  id: string,
  ko: string,
  translated: Partial<Record<CustomerLang, string>>,
  at: string,
): MockMessage => ({
  id,
  sender_type: 'staff',
  visibility: 'public',
  message_type: 'text',
  original_text: ko,
  original_language: 'ko',
  translated_text: translated,
  created_at: at,
});

/** Seeded customer conversation messages keyed by room id (mock; no DB). */
export const MOCK_CUSTOMER_MESSAGES: Record<string, MockMessage[]> = {
  'cust-503': [
    g('c503-1', 'zh-CN', '我想延长住宿一晚，503房间，多少钱？', '숙박을 하루 연장하고 싶어요. 503호, 얼마인가요?', T(9, 12)),
    {
      id: 'c503-2',
      sender_type: 'staff',
      visibility: 'internal',
      message_type: 'text',
      original_text: '503 연박 가능 여부 확인 필요 (청소 배정)',
      original_language: 'ko',
      translated_text: {},
      created_at: T(9, 13),
    },
    s('c503-3', '1박 연장 가능합니다. 1박 요금은 80,000원입니다.', { 'zh-CN': '可以延长1晚。每晚房费为80,000韩元。' }, T(9, 15)),
  ],
  'cust-308': [
    g('c308-1', 'ja', '明日の朝7時にタクシーを1台お願いできますか。308号室です。', '내일 아침 7시에 택시 1대 부탁드릴 수 있을까요? 308호입니다.', T(21, 40)),
  ],
  'cust-606': [
    g('c606-1', 'en', 'Where is the nearest bus stop for the airport?', '공항 가는 가장 가까운 버스정류장이 어디인가요?', T(10, 2)),
    {
      id: 'c606-2',
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
      id: 'c606-3',
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
  'cust-701': [
    {
      id: 'c701-1',
      sender_type: 'guest',
      visibility: 'public',
      message_type: 'text',
      original_text: 'Где находится ближайший ресторан?',
      original_language: 'ru',
      translated_text: {}, // translation-failure scenario
      translation_failed: true,
      created_at: T(19, 25),
    },
  ],
  'cust-502': [
    g('c502-1', 'zh-CN', '早餐几点开始？', '조식은 몇 시에 시작하나요?', T(8, 30)),
    s('c502-2', '조식은 오전 7시부터 10시까지입니다.', { 'zh-CN': '早餐时间为上午7点到10点。' }, T(8, 32)),
  ],
};

/** Mock staff-room timeline lines for the DEV team rooms (plain Korean, no translation). */
export const MOCK_STAFF_ROOM_LINES: Record<string, { who: string; text: string; at: string }[]> = {
  'staff-cleaning': [
    { who: '김청소', text: '503호 체크아웃 청소 완료했습니다.', at: T(10, 1) },
    { who: '이룸', text: '601호 어메니티 보충 필요해요.', at: T(10, 4) },
  ],
  'staff-front': [{ who: '프런트', text: '단체 체크인 15시 예정입니다.', at: T(9, 50) }],
  'staff-maintenance': [{ who: '정비', text: '702호 에어컨 점검 접수했습니다.', at: T(9, 10) }],
};
