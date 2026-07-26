// Node-only: embed reference flyer as data URI for self-contained print HTML / file:// preview.
// Do not import from client components.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Self-contained data URI for batch HTML / file:// preview (Node only). */
export function loadGuestNoticeGuideRefDataUri(): string {
  const file = join(process.cwd(), 'public', 'guest-notice', 'hero-guide-ref.jpg');
  const b64 = readFileSync(file).toString('base64');
  return `data:image/jpeg;base64,${b64}`;
}
