// Phase 1B feature flag. OFF by default (production must not expose the PoC).
// Enabled only when NEXT_PUBLIC_CUSTOMER_SERVICE_CONSOLE === '1' (dev/staging).
export function isCustomerServiceConsoleEnabled(): boolean {
  return process.env.NEXT_PUBLIC_CUSTOMER_SERVICE_CONSOLE === '1';
}
