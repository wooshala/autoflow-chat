// Phase 1C.1 — maps semantic color tokens to concrete UI classes. Kept in the UI layer
// so stored data (colorToken) stays decoupled from the design system.

import type { RoomColorToken } from './roomTypes';

const TEXT: Record<RoomColorToken, string> = {
  operations: 'text-emerald-600',
  housekeeping: 'text-sky-600',
  maintenance: 'text-amber-600',
  front: 'text-indigo-600',
  customer: 'text-blue-600',
};

export function roomColorText(token: RoomColorToken | undefined): string {
  return token ? TEXT[token] : 'text-gray-500';
}
