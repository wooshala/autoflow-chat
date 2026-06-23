import { useEffect, useRef } from 'react';
import type { ChatMessage } from '@/lib/types';
import { logUiRendered } from '@/lib/chat/sendTrace';

/** Log [CHAT_UI_RENDERED] when new message ids appear in the list. */
export function useChatRenderTrace(messages: ChatMessage[], enabled = true) {
  const seenRef = useRef<Set<string>>(new Set());
  const seededRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    if (!seededRef.current) {
      for (const m of messages) {
        const id = m?.id != null ? String(m.id) : '';
        if (id && !id.startsWith('tmp-')) seenRef.current.add(id);
      }
      seededRef.current = true;
      return;
    }
    for (const m of messages) {
      const id = m?.id != null ? String(m.id) : '';
      if (!id || id.startsWith('tmp-')) continue;
      if (seenRef.current.has(id)) continue;
      seenRef.current.add(id);
      logUiRendered(id);
    }
  }, [messages, enabled]);
}
