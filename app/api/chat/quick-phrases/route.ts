import { jsonErr, jsonOk } from '@/lib/api/envelope';
import { listQuickPhrases } from '@/lib/services/quickPhrases';
import { getSiteId } from '@/lib/site';

export async function GET() {
  try {
    const phrases = await listQuickPhrases(getSiteId());
    return jsonOk({ phrases });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonErr('QUICK_PHRASES_LIST_FAILED', msg, 500);
  }
}
