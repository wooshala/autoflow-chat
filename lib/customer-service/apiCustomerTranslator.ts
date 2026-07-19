// Phase 1F.7 — client-safe translator that calls the server API. NO 'openai' import,
// NO API key here. Throws on any failure (non-2xx / {ok:false} / malformed JSON) so the
// caller can keep the draft and surface an error instead of sending an untranslated reply.
// fetchImpl is injectable for unit tests.

export interface TranslateReplyOptions {
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

export const TRANSLATE_ENDPOINT = '/api/customer-service/translate';

/** Translate `text` from → to via the server API. Returns the translated string, or
 *  throws Error(code) on failure. `from === to` short-circuits with the original. */
export async function translateCustomerReply(
  text: string,
  from: string,
  to: string,
  opts: TranslateReplyOptions = {},
): Promise<string> {
  const body = String(text ?? '').trim();
  if (!body) throw new Error('EMPTY_TEXT');
  if (from === to) return body;

  const doFetch = opts.fetchImpl ?? fetch;
  const res = await doFetch(TRANSLATE_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: body, from, to }),
    signal: opts.signal,
  });

  if (!res.ok) throw new Error(`HTTP_${res.status}`);

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new Error('MALFORMED_JSON');
  }

  const data = json as { ok?: boolean; translatedText?: unknown; error?: { code?: string } };
  if (!data?.ok || typeof data.translatedText !== 'string' || !data.translatedText) {
    throw new Error(data?.error?.code ?? 'TRANSLATION_FAILED');
  }
  return data.translatedText;
}
