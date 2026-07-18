// Phase 1B — isolated DEV route for the Customer Service Console PoC.
// Reachable only when NEXT_PUBLIC_CUSTOMER_SERVICE_CONSOLE === '1'. This route does
// NOT touch /chat or /staff-chat, so it carries zero staff-chat regression risk.
// Production default (flag off) renders a disabled notice.

import CustomerConsole from '@/components/customer-service/CustomerConsole';
import { isCustomerServiceConsoleEnabled } from '@/lib/customer-service/flags';

export const dynamic = 'force-dynamic';

export default function CustomerConsolePage() {
  if (!isCustomerServiceConsoleEnabled()) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-100 p-8 text-center text-sm text-gray-500">
        <div>
          고객 서비스 콘솔 PoC는 비활성화되어 있습니다.
          <br />
          <code>NEXT_PUBLIC_CUSTOMER_SERVICE_CONSOLE=1</code> 로 활성화하세요 (dev/staging 전용).
        </div>
      </main>
    );
  }
  return (
    <main className="min-h-screen bg-gray-100 p-4">
      <h1 className="mb-3 text-lg font-semibold text-gray-800">
        고객 서비스 콘솔 <span className="text-xs font-normal text-gray-400">Phase 1B PoC (mock)</span>
      </h1>
      <CustomerConsole />
    </main>
  );
}
