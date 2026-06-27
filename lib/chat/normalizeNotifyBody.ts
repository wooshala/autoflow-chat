// Build a notification/popup body that shows the room number exactly once.
// The room prefix and the message text both tend to carry the room (e.g. text
// "601 담배냄새" + room "601"), which previously produced "601호 601 담배냄새".
//
// Policy:
//   room="601", text="601 담배냄새"   → "601호 담배냄새"
//   room="601", text="601호 담배냄새" → "601호 담배냄새"
//   room="601", text="담배냄새"       → "601호 담배냄새"
//   room="601", text="601"            → "601호"
//   room=null                         → text (unchanged)
//
// Used for BOTH the browser Notification body and the Tauri native toast body so
// they never differ. The raw stored message text is never modified.
export function normalizeNotifyBody(room: string | null | undefined, text: string): string {
  const t = String(text || '').trim();
  const r = String(room || '').trim();
  if (!r) return t;

  const esc = r.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Leading "{room}" or "{room}호" + optional separator/space.
  const re = new RegExp(`^\\s*${esc}\\s*호?\\s*[)\\].:·\\-]?\\s*`);

  // Strip repeated leading room prefixes (handles already-doubled inputs too).
  let stripped = t;
  let prev = '';
  while (stripped && stripped !== prev) {
    prev = stripped;
    stripped = stripped.replace(re, '').trim();
  }

  return stripped ? `${r}호 ${stripped}` : `${r}호`;
}
