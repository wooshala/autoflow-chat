import type { MainCategory, ClassificationFlags } from '@/lib/chat/classifyMessageCategory';

function normalize(text: string) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function roomLabel(roomNumber: string | null) {
  return roomNumber ? `${roomNumber}호 ` : '';
}

function includesAny(haystack: string, keywords: string[]) {
  const t = haystack.toLowerCase();
  return keywords.find((k) => t.includes(k.toLowerCase())) || null;
}

export function getMessageActionSummary(params: {
  text: string;
  roomNumber: string | null;
  mainCategory: MainCategory;
  flags: ClassificationFlags;
}): string {
  const raw = normalize(params.text);
  const room = roomLabel(params.roomNumber);
  const lower = raw.toLowerCase();

  if (params.mainCategory === 'turnover') {
    if (lower.includes('청소') && (lower.includes('가능') || lower.includes('완료'))) return `${room}퇴실 / 청소 가능`.trim();
    return `${room}퇴실/객실전환 확인`.trim();
  }

  if (params.mainCategory === 'repair') {
    const target =
      includesAny(raw, ['변기', '세면대', '도어락', '리모컨', '에어컨', '샤워기', '전등', '냉장고', 'tv', '티비']) || '설비';
    return `${room}${target} 점검 필요`.trim();
  }

  if (params.mainCategory === 'environment') {
    if (lower.includes('담배')) return `${room}담배/냄새 확인 필요`.trim();
    if (lower.includes('냄새') || lower.includes('악취')) return `${room}냄새 확인 필요`.trim();
    if (lower.includes('환기')) return `${room}환기 확인 필요`.trim();
    return `${room}환경 확인 필요`.trim();
  }

  if (params.mainCategory === 'cleaning') {
    const item =
      includesAny(raw, ['수건', '휴지', '비품', '침구', '시트', '물티슈', '생수', '어메니티', '정리', '청소']) || '청소/비품';
    return `${room}${item} 처리 필요`.trim();
  }

  if (params.flags.status) return `${room}객실 상태 확인`.trim();
  if (params.flags.request) return `${room}요청 확인`.trim();

  return `${room}${raw}`.trim();
}

