// Phase 2A — PURE normalization/validation for the Customer Context write path. Import-free so
// it runs under `node --test`. Trims strings, caps lengths, and validates the checkout date
// (YYYY-MM-DD or empty). Throws 'INVALID_DATE' for a malformed date so the route can 422.

export interface RawContextInput {
  guestName?: unknown;
  guestPhone?: unknown;
  checkOutDate?: unknown;
  vehicleNo?: unknown;
  memo?: unknown;
}

export interface CleanContextInput {
  guestName: string;
  guestPhone: string;
  checkOutDate: string | null;
  vehicleNo: string;
  memo: string;
}

// Caps MUST match the DB CHECK constraints in the migration (guest_customer_context).
const MAX = { name: 100, phone: 50, vehicle: 50, memo: 2000 } as const;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function clean(v: unknown, cap: number): string {
  return (typeof v === 'string' ? v : '').trim().slice(0, cap);
}

export function normalizeContextInput(raw: RawContextInput): CleanContextInput {
  let checkOutDate: string | null = null;
  if (typeof raw.checkOutDate === 'string' && raw.checkOutDate.trim()) {
    const d = raw.checkOutDate.trim();
    if (!DATE_RE.test(d) || Number.isNaN(Date.parse(d))) throw new Error('INVALID_DATE');
    checkOutDate = d;
  }
  return {
    guestName: clean(raw.guestName, MAX.name),
    guestPhone: clean(raw.guestPhone, MAX.phone),
    checkOutDate,
    vehicleNo: clean(raw.vehicleNo, MAX.vehicle),
    memo: clean(raw.memo, MAX.memo),
  };
}
