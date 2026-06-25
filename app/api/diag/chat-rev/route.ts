import { jsonOk } from '@/lib/api/envelope';
import { CHAT_CLIENT_REV, CHAT_PAGE_SOURCE } from '@/lib/chat/chatClientRev';

/** Deploy probe: GET /api/diag/chat-rev — server bundle must include latest chatClientRev. */
export async function GET() {
  return jsonOk({
    chat_rev: CHAT_CLIENT_REV,
    page_source: CHAT_PAGE_SOURCE,
    diag_component: 'components/chat/ChatNotifyDiagBar.tsx'
  });
}
