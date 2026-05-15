export type MainCategory = 'cleaning' | 'repair' | 'environment' | 'turnover' | 'general';

export type ClassificationFlags = {
  urgent: boolean;
  request: boolean;
  status: boolean;
};

export type ClassificationScore = Record<MainCategory, number>;

export type ClassificationResult = {
  mainCategory: MainCategory;
  flags: ClassificationFlags;
  roomNumber: string | null;
  matchedKeywords: Record<string, string[]>;
  reasons: string[];
  score: ClassificationScore;
};

export type LegacyMessageCategory =
  | 'cleaning'
  | 'repair'
  | 'environment'
  | 'request'
  | 'status'
  | 'checkout'
  | 'urgent'
  | 'general';

type KeywordRule = {
  key: string;
  weight?: number;
};

// Priority (main): repair → environment → turnover → cleaning → general
// Flags (urgent/request/status) are orthogonal and do NOT override mainCategory.
const MAIN_CATEGORY_RULES: Record<Exclude<MainCategory, 'general'>, KeywordRule[]> = {
  cleaning: [
    { key: '청소', weight: 3 },
    { key: '수건', weight: 2 },
    { key: '휴지', weight: 2 },
    { key: '비품', weight: 2 },
    { key: '정리', weight: 1 },
    { key: '객실 정리', weight: 3 },
    { key: '객실정리', weight: 3 },
    { key: '침구', weight: 2 },
    { key: '시트', weight: 2 },
    { key: '물티슈', weight: 2 },
    { key: '생수', weight: 1 },
    { key: '어메니티', weight: 2 }
  ],
  repair: [
    { key: '고장', weight: 3 },
    { key: '파손', weight: 3 },
    { key: '깨짐', weight: 3 },
    { key: '누수', weight: 3 },
    { key: '배수', weight: 2 },
    { key: '막힘', weight: 3 },
    { key: '안켜짐', weight: 3 },
    { key: '안 켜짐', weight: 3 },
    { key: '떨어짐', weight: 2 },
    { key: '전등', weight: 2 },
    { key: '샤워기', weight: 3 },
    { key: '에어컨', weight: 3 },
    { key: 'tv', weight: 2 },
    { key: '티비', weight: 2 },
    { key: '냉장고', weight: 3 },
    { key: '변기', weight: 3 },
    { key: '세면대', weight: 2 },
    { key: '문짝', weight: 2 },
    { key: '도어락', weight: 3 },
    { key: '리모컨', weight: 2 }
  ],
  environment: [
    { key: '담배', weight: 3 },
    { key: '담배냄새', weight: 4 },
    { key: '냄새', weight: 2 },
    { key: '냄새남', weight: 3 },
    { key: '악취', weight: 3 },
    { key: '환기', weight: 2 },
    { key: '방향제', weight: 1 }
  ],
  turnover: [
    { key: '퇴실', weight: 4 },
    { key: '나감', weight: 3 },
    { key: '체크아웃', weight: 4 },
    { key: 'check out', weight: 4 },
    { key: '빈방', weight: 3 },
    { key: '방 비움', weight: 3 },
    { key: '방비움', weight: 3 },
    { key: '청소 가능', weight: 3 },
    { key: '손님 나감', weight: 4 },
    { key: '객실 비움', weight: 3 }
  ]
};

const FLAG_RULES = {
  urgent: ['급함', '빨리', 'asap', '즉시', '긴급', '당장', '위험', '물 넘침', '냄새 심함', '심각'],
  request: ['주세요', '부탁', '요청', '가져다', '가져다주세요', '부탁드립니다'],
  status: [
    '청소 끝',
    '청소 완료',
    '청소 다함',
    '청소 안',
    '손님 있음',
    '손님 아직 있음',
    '짐 있음',
    '연박',
    '아직 있음',
    '사용중',
    '사용 중'
  ]
} as const;

export function normalizeText(text: string): string {
  return (text || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function pushUnique(target: string[], value: string) {
  if (!target.includes(value)) target.push(value);
}

export function extractRoomNumber(text: string): string | null {
  const raw = text || '';

  const patterns = [
    /(?:객실\s*)?(\d{3,4})호?\b/,
    /\b(\d{1,2})-(\d{2})\b/
  ];

  for (const p of patterns) {
    const m = raw.match(p);
    if (!m) continue;
    if ((m as any)[2]) return `${m[1]}${m[2]}`;
    return m[1] ?? null;
  }

  return null;
}

export function createEmptyScore(): ClassificationScore {
  return {
    cleaning: 0,
    repair: 0,
    environment: 0,
    turnover: 0,
    general: 0
  };
}

export function scoreMainCategories(
  normalized: string,
  matchedKeywords: Record<string, string[]>,
  reasons: string[]
): ClassificationScore {
  const score = createEmptyScore();

  (Object.keys(MAIN_CATEGORY_RULES) as Array<Exclude<MainCategory, 'general'>>).forEach((category) => {
    for (const rule of MAIN_CATEGORY_RULES[category]) {
      if (!normalized.includes(rule.key.toLowerCase())) continue;
      const weight = rule.weight ?? 1;
      score[category] += weight;
      matchedKeywords[category] ||= [];
      pushUnique(matchedKeywords[category], rule.key);
      reasons.push(`${category} keyword matched: ${rule.key} (+${weight})`);
    }
  });

  // Contextual repair rule: device/facility + "안됨" family (avoid broad "안됨" standalone).
  const hasBrokenExpression =
    normalized.includes('안됨') ||
    normalized.includes('안 됨') ||
    normalized.includes('안켜짐') ||
    normalized.includes('안 켜짐');

  const hasRepairObject = ['에어컨', 'tv', '티비', '냉장고', '샤워기', '변기', '세면대', '도어락', '리모컨', '전등'].some((kw) =>
    normalized.includes(kw.toLowerCase())
  );

  if (hasBrokenExpression && hasRepairObject) {
    score.repair += 3;
    matchedKeywords.repair ||= [];
    pushUnique(matchedKeywords.repair, '안됨(설비문맥)');
    reasons.push('repair contextual rule matched: broken expression + repair object (+3)');
  }

  // Contextual environment: 담배 + 냄새
  if (normalized.includes('담배') && (normalized.includes('냄새') || normalized.includes('냄새남'))) {
    score.environment += 2;
    matchedKeywords.environment ||= [];
    pushUnique(matchedKeywords.environment, '담배+냄새');
    reasons.push('environment contextual rule matched: 담배 + 냄새 (+2)');
  }

  // Contextual turnover: 퇴실 + 청소 가능
  if (normalized.includes('퇴실') && (normalized.includes('청소') || normalized.includes('가능'))) {
    score.turnover += 2;
    matchedKeywords.turnover ||= [];
    pushUnique(matchedKeywords.turnover, '퇴실+청소가능');
    reasons.push('turnover contextual rule matched: 퇴실 + 청소/가능 (+2)');
  }

  return score;
}

export function detectFlags(
  normalized: string,
  matchedKeywords: Record<string, string[]>,
  reasons: string[]
): ClassificationFlags {
  const flags: ClassificationFlags = {
    urgent: false,
    request: false,
    status: false
  };

  for (const kw of FLAG_RULES.urgent) {
    if (!normalized.includes(kw.toLowerCase())) continue;
    flags.urgent = true;
    matchedKeywords.urgent ||= [];
    pushUnique(matchedKeywords.urgent, kw);
    reasons.push(`urgent flag matched: ${kw}`);
  }

  const requestDirect = FLAG_RULES.request.some((kw) => normalized.includes(kw.toLowerCase()));

  const requestSoft =
    (normalized.includes('더') || normalized.includes('추가')) &&
    ['수건', '휴지', '비품', '생수', '어메니티', '물티슈', '시트'].some((kw) => normalized.includes(kw.toLowerCase()));

  if (requestDirect || requestSoft) {
    flags.request = true;
    matchedKeywords.request ||= [];
    if (requestDirect) {
      FLAG_RULES.request.forEach((kw) => {
        if (normalized.includes(kw.toLowerCase())) pushUnique(matchedKeywords.request!, kw);
      });
      reasons.push('request flag matched: direct request expression');
    }
    if (requestSoft) {
      pushUnique(matchedKeywords.request, '더/추가 + 비품');
      reasons.push('request flag matched: soft request expression');
    }
  }

  for (const kw of FLAG_RULES.status) {
    if (!normalized.includes(kw.toLowerCase())) continue;
    flags.status = true;
    matchedKeywords.status ||= [];
    pushUnique(matchedKeywords.status, kw);
    reasons.push(`status flag matched: ${kw}`);
  }

  return flags;
}

export function chooseMainCategory(score: ClassificationScore): MainCategory {
  const ordered: MainCategory[] = ['repair', 'environment', 'turnover', 'cleaning', 'general'];

  let best: MainCategory = 'general';
  let bestScore = 0;

  for (const category of ordered) {
    const s = score[category];
    if (s > bestScore) {
      best = category;
      bestScore = s;
    }
  }

  return bestScore > 0 ? best : 'general';
}

export function classifyMessage(text: string): ClassificationResult {
  const normalized = normalizeText(text);
  const matchedKeywords: Record<string, string[]> = {};
  const reasons: string[] = [];

  if (!normalized) {
    return {
      mainCategory: 'general',
      flags: { urgent: false, request: false, status: false },
      roomNumber: null,
      matchedKeywords,
      reasons: ['empty text'],
      score: createEmptyScore()
    };
  }

  const score = scoreMainCategories(normalized, matchedKeywords, reasons);
  const flags = detectFlags(normalized, matchedKeywords, reasons);
  const roomNumber = extractRoomNumber(text);
  const mainCategory = chooseMainCategory(score);

  return {
    mainCategory,
    flags,
    roomNumber,
    matchedKeywords,
    reasons,
    score
  };
}

// Backward-compatible "old" API: mainCategory only.
export function classifyMessageCategory(text: string): MainCategory {
  return classifyMessage(text).mainCategory;
}

export function classifyLegacyMessageCategory(text: string): LegacyMessageCategory {
  const result = classifyMessage(text);

  if (result.flags.urgent) return 'urgent';
  if (result.flags.status) return 'status';
  if (result.flags.request && result.mainCategory === 'general') return 'request';
  if (result.mainCategory === 'turnover') return 'checkout';
  return result.mainCategory;
}

export function getCategoryLabel(category: MainCategory): string {
  switch (category) {
    case 'cleaning':
      return '청소';
    case 'repair':
      return '수리';
    case 'environment':
      return '환경';
    case 'turnover':
      return '객실전환';
    case 'general':
    default:
      return '일반';
  }
}

export function getCategoryBadgeClassName(category: MainCategory): string {
  switch (category) {
    case 'repair':
      return 'bg-orange-50 text-orange-700 ring-orange-200';
    case 'environment':
      return 'bg-amber-50 text-amber-800 ring-amber-200';
    case 'turnover':
      return 'bg-emerald-50 text-emerald-700 ring-emerald-200';
    case 'cleaning':
      return 'bg-sky-50 text-sky-700 ring-sky-200';
    case 'general':
    default:
      return 'bg-gray-50 text-gray-700 ring-gray-200';
  }
}

export function getCategoryTone(
  category: MainCategory,
  flags?: Partial<ClassificationFlags>
): 'alert' | 'warn' | 'info' | 'neutral' {
  if (flags?.urgent) return 'alert';
  switch (category) {
    case 'repair':
    case 'environment':
      return 'warn';
    case 'cleaning':
    case 'turnover':
      return 'info';
    case 'general':
    default:
      return 'neutral';
  }
}

export const CLASSIFY_MESSAGE_DEBUG_CASES = [
  '601 담배냄새',
  '601 담배냄새 심함 빨리',
  '503 퇴실, 청소 가능',
  '402 에어컨 안됨',
  '수건 더 주세요',
  '손님 아직 있음',
  '짐 있음',
  '변기 막힘 급함',
  '청소 완료',
  '연박'
] as const;

