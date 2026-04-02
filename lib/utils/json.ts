/**
 * Browser/server-safe JSON parse for optional string input (e.g. localStorage).
 * Never throws; returns null on missing input or parse failure.
 */
export function safeParseJson(raw: string | null | undefined): unknown | null {
  if (raw == null) return null;
  const s = String(raw);
  if (!s.trim()) return null;
  try {
    return JSON.parse(s) as unknown;
  } catch {
    return null;
  }
}
