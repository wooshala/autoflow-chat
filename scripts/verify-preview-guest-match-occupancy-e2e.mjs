/**
 * Preview E2E smoke for occupancy prior-guest match.
 * PREVIEW_BASE=https://... node scripts/verify-preview-guest-match-occupancy-e2e.mjs
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = (process.env.PREVIEW_BASE || '').replace(/\/$/, '');
const BYPASS = process.env.VERCEL_PROTECTION_BYPASS || 'Fi6Wuf8lQ8ARpuop67POAVLAGxH5qYGN';
const OUT = join(__dirname, 'preview-guest-match-occupancy-e2e.json');
const SHOT = join(__dirname, 'preview-guest-match-occupancy.png');

async function main() {
  if (!BASE) {
    console.error('PREVIEW_BASE required');
    process.exit(1);
  }
  const api = await fetch(`${BASE}/api/ops-events/lost-found`, {
    headers: { 'x-vercel-protection-bypass': BYPASS }
  }).then((r) => r.json());
  const items = api.data?.items || [];
  const lf308 = items.find((i) => i.event_no === 'LF-000011');
  const lf205 = items.find((i) => i.event_no === 'LF-000008');
  const lf309 = items.find((i) => i.event_no === 'LF-000012');

  const checks = {
    '308_not_handonghwa':
      lf308 &&
      lf308.guestMatch?.guest_name !== '한동화' &&
      (lf308.guestMatch?.status === 'none' || lf308.guestMatch?.status === 'multiple'),
    '205_none_or_prior':
      lf205 &&
      (lf205.guestMatch?.status === 'none' ||
        (lf205.guestMatch?.status === 'exact' && lf205.guestMatch?.stay_date && lf205.guestMatch.stay_date < '2026-07-07')),
    '309_not_post_checkin_only_bug': lf309 && lf309.guestMatch?.status !== 'unavailable'
  };

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS }
  });
  await context.addInitScript(() => {
    localStorage.setItem(
      'autoflow_user_v1',
      JSON.stringify({ name: 'GM-OCC-E2E', created_at: new Date().toISOString() })
    );
  });
  const page = await context.newPage();
  await page.goto(`${BASE}/chat`, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(4000);
  await page.getByText('Event Center', { exact: true }).waitFor({ state: 'visible', timeout: 30000 });
  const lf = page.locator('#event-center-lost-found');
  await lf.getByRole('button', { name: '전체' }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: SHOT, fullPage: false });
  const stayed = page.url().includes('/chat') && !page.url().includes('/ops/');

  const result = {
    preview: `${BASE}/chat`,
    checks,
    samples: {
      LF000011: lf308?.guestMatch,
      LF000008: lf205?.guestMatch,
      LF000012: lf309?.guestMatch
    },
    stayedOnChat: stayed,
    passed: Object.values(checks).every(Boolean) && stayed
  };
  writeFileSync(OUT, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
  if (!result.passed) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
