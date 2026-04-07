import { openai } from '@/lib/openai';

export type IntentIssueType =
  | 'housekeeping'
  | 'maintenance'
  | 'frontdesk'
  | 'checkout'
  | 'payment'
  | 'ops_note';
export type MappedIssueType = '설비' | '청소' | '분실물' | '요청' | '기타';

export type AiParseResult = {
  room: string | null;
  issue_type: IntentIssueType;
  summary: string;
  is_new_issue: boolean;
  confidence: number | null;
};

const ISSUE_MAP: Record<IntentIssueType, MappedIssueType> = {
  maintenance: '설비',
  housekeeping: '청소',
  frontdesk: '기타',
  checkout: '기타',
  payment: '기타',
  ops_note: '기타'
};

function asIntentIssueType(value: unknown): IntentIssueType | null {
  if (
    value === 'maintenance' ||
    value === 'housekeeping' ||
    value === 'frontdesk' ||
    value === 'checkout' ||
    value === 'payment' ||
    value === 'ops_note'
  ) {
    return value;
  }
  return null;
}

function sanitizeRoom(value: unknown): string | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const m = raw.match(/\d{3,4}/);
  return m ? m[0] : null;
}

function extractRoomByRule(message: string): string | null {
  const m = message.match(/\b(\d{3,4})호?\b/);
  return m ? m[1] : null;
}

function unwrapJsonText(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  return trimmed
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
}

export function mapIntentIssueTypeToKo(issueType: IntentIssueType): MappedIssueType {
  return ISSUE_MAP[issueType];
}

export async function parseMessage(message: string, recentMessages: string[]): Promise<AiParseResult | null> {
  console.log('[AI_OPENAI_STATUS]', {
    hasOpenAI: Boolean(openai),
    messagePreview: String(message || '').slice(0, 40),
    recentCount: recentMessages.length
  });
  if (!openai) return null;

  const fallbackRoom = extractRoomByRule(message);
  const prompt = `
최근 대화:
${recentMessages.join('\n')}

현재 메시지:
${message}

JSON으로만 답변:
{
  "room": string | null,
  "issue_type": "housekeeping" | "maintenance" | "frontdesk" | "checkout" | "payment" | "ops_note",
  "summary": string,
  "is_new_issue": boolean,
  "confidence": number (0~1, 확신이 낮으면 0.4 이하)
}
`;

  try {
    const res = await Promise.race([
      openai.responses.create({
        model: 'gpt-4.1-mini',
        input: prompt
      }),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('ai timeout')), 6000);
      })
    ]);
    console.log('[AI_RAW_RESPONSE]', {
      output_text: res.output_text || null
    });

    const parsed = JSON.parse(unwrapJsonText(res.output_text || '{}')) as Partial<AiParseResult>;
    const issueType = asIntentIssueType(parsed.issue_type);
    if (!issueType) {
      console.log('[AI_SKIP_INVALID_ISSUE_TYPE]', {
        issue_type: parsed.issue_type
      });
      return null;
    }

    const confidenceRaw = (parsed as any).confidence;
    const confidence =
      typeof confidenceRaw === 'number' && Number.isFinite(confidenceRaw)
        ? Math.max(0, Math.min(1, confidenceRaw))
        : null;

    const finalResult: AiParseResult = {
      room: sanitizeRoom(parsed.room) || fallbackRoom,
      issue_type: issueType,
      summary: String(parsed.summary || '').trim() || message.trim(),
      is_new_issue: Boolean(parsed.is_new_issue),
      confidence
    };
    console.log('[AI_PARSED_RETURN]', finalResult);
    return finalResult;
  } catch (error: any) {
    console.error('[AI_PARSE_ERROR]', {
      error: error?.message || String(error)
    });
    return null;
  }
}
