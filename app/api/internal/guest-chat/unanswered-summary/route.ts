// Phase 2D — GET /api/internal/guest-chat/unanswered-summary
//
// Server-to-server ONLY. Consumed by the univer-ops ledger backend, which relays it to the
// staff browser same-origin; the browser never calls this directly, so no CORS headers are
// emitted (an Access-Control-Allow-Origin here would make the feed browser-reachable).
//
// Returns rooms whose OPEN session has a guest message newer than the newest staff reply.
// Bodies: only `latestGuestMessagePreview` (masked ≤80). Never original_text / translated_json.

import { NextResponse, type NextRequest } from 'next/server';
import { authorizeInternalRequest } from '@/lib/guest-spike/internalAuth';
import { listUnansweredSummaryData } from '@/lib/guest-spike/store';
import { buildUnansweredSummary } from '@/lib/guest-spike/unansweredSummary';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const ROUTE = '/api/internal/guest-chat/unanswered-summary';

export async function GET(req: NextRequest) {
  const auth = authorizeInternalRequest(req);
  if (!auth.ok) {
    if (auth.reason === 'not_configured') {
      // Operator error, not a caller error: an empty feed here would look like "no unanswered
      // rooms" and silently hide real guests.
      console.error('[GUEST_CHAT_INTERNAL]', { route: ROUTE, error: 'secret_not_configured' });
      return NextResponse.json({ error: 'failed_to_load_guest_chat_summary' }, { status: 500 });
    }
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const { sessions, messages } = await listUnansweredSummaryData();
    const summary = buildUnansweredSummary(sessions, messages, new Date().toISOString());
    // force-dynamic only stops build-time caching. A stale unanswered list is worse than none,
    // so forbid every intermediary between here and the ledger backend from holding a copy.
    return NextResponse.json(summary, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    // Never surface DB details. Nothing here may include message text, the secret, or the
    // Authorization header.
    console.error('[GUEST_CHAT_INTERNAL]', {
      route: ROUTE,
      error: 'summary_query_failed',
      kind: e instanceof Error ? e.name : typeof e,
    });
    return NextResponse.json({ error: 'failed_to_load_guest_chat_summary' }, { status: 500 });
  }
}
