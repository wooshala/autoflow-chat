import { ChatMessage, MaintenancePhoto, MaintenanceTicket, User } from '@/lib/types';

declare global {
  // eslint-disable-next-line no-var
  var __autoflowMockStore: {
    users: User[];
    messages: ChatMessage[];
    tickets: MaintenanceTicket[];
    photos: MaintenancePhoto[];
  } | undefined;
}

function nowMinus(minutes: number) {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

function seedStore() {
  const users: User[] = [
    { id: 'u-admin', name: '김관리자', role: 'admin', language: 'ko', pin: '0000', created_at: nowMinus(600) },
    { id: 'u-front', name: '이프론트', role: 'front', language: 'ko', pin: '1111', created_at: nowMinus(590) },
    { id: 'u-vn', name: 'Nguyen Van A', role: 'cleaning', language: 'vi', pin: '2222', created_at: nowMinus(580) },
    { id: 'u-ru', name: 'Anna Ivanova', role: 'cleaning', language: 'ru', pin: '3333', created_at: nowMinus(570) }
  ];

  const ticket1: MaintenanceTicket = {
    id: 't-203', room_no: '203', issue_type: '설비', description: '욕실 배수구 물이 잘 빠지지 않음',
    status: 'progress', created_by: 'u-vn', created_at: nowMinus(40), updated_at: nowMinus(20),
    creator: { id: 'u-vn', name: 'Nguyen Van A', role: 'cleaning', language: 'vi' }
  };
  const photo1: MaintenancePhoto = {
    id: 'p-203-b', ticket_id: 't-203', image_url: 'https://images.unsplash.com/photo-1585771724684-38269d6639fd?w=800&h=600&fit=crop',
    storage_path: 'mock/p-203-b.jpg', photo_type: 'before', created_at: nowMinus(40)
  };
  const ticket2: MaintenanceTicket = {
    id: 't-307', room_no: '307', issue_type: '가전', description: '에어컨 전원이 켜지지 않음',
    status: 'open', created_by: 'u-ru', created_at: nowMinus(15), updated_at: nowMinus(15),
    creator: { id: 'u-ru', name: 'Anna Ivanova', role: 'cleaning', language: 'ru' }
  };
  const photo2: MaintenancePhoto = {
    id: 'p-307-b', ticket_id: 't-307', image_url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&h=600&fit=crop',
    storage_path: 'mock/p-307-b.jpg', photo_type: 'before', created_at: nowMinus(15)
  };

  const messages: ChatMessage[] = [
    {
      id: 'm-1', user_id: 'u-front', message: '오늘 103호 체크인 오후 3시로 변경됐습니다', message_type: 'text',
      room_no: null, image_url: null, image_storage_path: null, original_lang: 'ko',
      translated_text: { ko: '오늘 103호 체크인 오후 3시로 변경됐습니다', vi: 'Check-in phòng 103 hôm nay đổi sang 3 giờ chiều', ru: 'Заселение в 103 номер сегодня перенесено на 15:00', en: 'Room 103 check-in changed to 3pm today' },
      ticket_id: null, created_at: nowMinus(70), user: { id: 'u-front', name: '이프론트', role: 'front', language: 'ko' }
    },
    {
      id: 'm-2', user_id: 'u-vn', message: 'Phòng 203 có vấn đề với đường thoát nước', message_type: 'text',
      room_no: '203', image_url: null, image_storage_path: null, original_lang: 'vi',
      translated_text: { ko: '203호 배수구에 문제가 있습니다', vi: 'Phòng 203 có vấn đề với đường thoát nước', ru: 'В номере 203 проблема со сливом', en: 'Room 203 has a drainage problem' },
      ticket_id: null, created_at: nowMinus(41), user: { id: 'u-vn', name: 'Nguyen Van A', role: 'cleaning', language: 'vi' }
    },
    {
      id: 'm-3', user_id: 'u-vn', message: '🔧 203호 설비 접수됨', message_type: 'maintenance',
      room_no: '203', image_url: photo1.image_url, image_storage_path: photo1.storage_path, original_lang: 'ko', translated_text: null,
      ticket_id: 't-203', created_at: nowMinus(40), user: { id: 'u-vn', name: 'Nguyen Van A', role: 'cleaning', language: 'vi' }
    },
    {
      id: 'm-4', user_id: 'u-ru', message: 'В номере 307 сломан кондиционер', message_type: 'text',
      room_no: '307', image_url: null, image_storage_path: null, original_lang: 'ru',
      translated_text: { ko: '307호 에어컨이 고장났습니다', vi: 'Máy lạnh phòng 307 bị hỏng', ru: 'В номере 307 сломан кондиционер', en: 'Air conditioner in room 307 is broken' },
      ticket_id: null, created_at: nowMinus(16), user: { id: 'u-ru', name: 'Anna Ivanova', role: 'cleaning', language: 'ru' }
    }
  ];

  return { users, messages, tickets: [ticket2, ticket1], photos: [photo1, photo2] };
}

export function getMockStore() {
  if (!global.__autoflowMockStore) {
    global.__autoflowMockStore = seedStore();
  }
  return global.__autoflowMockStore;
}
