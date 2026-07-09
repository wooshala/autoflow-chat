/**
 * Production E2E: lost-found guestMatch + list ops (store/delete), stay on /chat.
 * URL: https://autoflow-mvp.vercel.app/chat
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = (process.env.PRODUCTION_BASE || 'https://autoflow-mvp.vercel.app').replace(/\/$/, '');
const BYPASS = process.env.VERCEL_PROTECTION_BYPASS || 'Fi6Wuf8lQ8ARpuop67POAVLAGxH5qYGN';
const TEST_ROOM = process.env.E2E_ROOM_NO || '607';
const SHOT_REGISTERED = join(__dirname, 'production-stay-journal-registered.png');
const SHOT_GUESTMATCH = join(__dirname, 'production-stay-journal-guestmatch.png');
const SHOT_STORED = join(__dirname, 'production-stay-journal-stored.png');
const OUT_JSON = join(__dirname, 'production-stay-journal-e2e.json');

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

function pickGuestMatchFields(item) {
  const gm = item?.guestMatch;
  return {
    event_no: item?.event_no,
    snap_room_no: item?.snap_room_no,
    snap_sender: item?.snap_sender,
    found_at: item?.snap_message_created_at || item?.created_at,
    guestMatch: gm
      ? {
          status: gm.status,
          stars: gm.stars,
          starsDisplay: gm.starsDisplay,
          label: gm.label,
          segmentLabel: gm.segmentLabel,
          guest_name: gm.guest_name,
          phone: gm.phone,
          stay_date: gm.stay_date,
          check_in: gm.check_in,
          check_out: gm.check_out,
          reservation_source: gm.reservation_source,
          candidates_count: gm.candidates?.length ?? 0
        }
      : null
  };
}

async function selectRoom(page, roomNo) {
  await page.getByRole('button', { name: /객실 선택|호$/ }).first().click();
  await page.waitForTimeout(300);
  for (const ch of String(roomNo)) {
    await page.getByRole('button', { name: ch, exact: true }).click();
  }
  await page.getByRole('button', { name: '확인' }).click();
  await page.waitForTimeout(400);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS }
  });
  await context.addInitScript(() => {
    localStorage.setItem(
      'autoflow_user_v1',
      JSON.stringify({ name: 'SJ-PROD-E2E', created_at: new Date().toISOString() })
    );
  });

  const page = await context.newPage();
  page.on('dialog', async (d) => {
    await d.accept();
  });
  const navigations = [];
  page.on('framenavigated', (f) => {
    if (f === page.mainFrame()) navigations.push(f.url());
  });

  const result = {
    productionUrl: `${BASE}/chat`,
    steps: [],
    apiSamples: {},
    guestMatchCases: { exact: null, none: null },
    errors: [],
    passed: false
  };

  try {
    await page.goto(`${BASE}/chat`, { waitUntil: 'networkidle', timeout: 120000 });
    await page.waitForTimeout(4000);
    await page.getByText('Event Center', { exact: true }).waitFor({ state: 'visible', timeout: 30000 });
    result.steps.push({ step: 1, action: 'goto /chat', url: page.url() });

    const lfSection = page.locator('#event-center-lost-found');
    await lfSection.waitFor({ state: 'visible', timeout: 15000 });

    const apiBefore = await page.request.get(`${BASE}/api/ops-events/lost-found`);
    const apiBeforeJson = apiBefore.ok() ? await apiBefore.json() : null;
    const itemsBefore = apiBeforeJson?.data?.items || apiBeforeJson?.items || [];
    result.apiSamples.beforeRegister = {
      status: apiBefore.status(),
      items_count: itemsBefore.length
    };

    const exactItem = itemsBefore.find((i) => i.guestMatch?.status === 'exact');
    const noneItem = itemsBefore.find((i) => i.guestMatch?.status === 'none');
    if (exactItem) result.guestMatchCases.exact = pickGuestMatchFields(exactItem);
    if (noneItem) result.guestMatchCases.none = pickGuestMatchFields(noneItem);

    await selectRoom(page, TEST_ROOM);
    const fileInput = page.locator('input[type="file"][accept="image/*"]');
    await fileInput.setInputFiles({
      name: 'e2e-prod-stay-journal.png',
      mimeType: 'image/png',
      buffer: TINY_PNG
    });
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: '▶' }).click();
    await page.waitForTimeout(8000);

    const registerBtn = page.getByRole('button', { name: /🧳 분실물$/ }).first();
    await registerBtn.waitFor({ state: 'visible', timeout: 20000 });
    await registerBtn.click();
    await page.waitForTimeout(5000);
    result.steps.push({ step: 2, action: 'register lost-found', url: page.url() });

    const openFilter = lfSection.getByRole('button', { name: '미해결' });
    if (await openFilter.isVisible().catch(() => false)) await openFilter.click();

    const listItem = lfSection.locator('li').filter({ hasText: /LF-/ }).first();
    await listItem.waitFor({ state: 'visible', timeout: 20000 });
    const cardText = await listItem.innerText();
    const eventNo = (cardText.match(/LF-\d{6}/) || [])[0] || null;
    const hasGuestMatchUi = /★|숙박일지/.test(cardText);
    result.steps.push({ step: 3, eventNo, hasGuestMatchUi, cardPreview: cardText.slice(0, 500) });
    await page.screenshot({ path: SHOT_REGISTERED, fullPage: false });

    const apiAfter = await page.request.get(`${BASE}/api/ops-events/lost-found`);
    const apiAfterJson = apiAfter.ok() ? await apiAfter.json() : null;
    const itemsAfter = apiAfterJson?.data?.items || apiAfterJson?.items || [];
    const matched =
      itemsAfter.find((x) => x.event_no === eventNo) ||
      itemsAfter.find((x) => x.snap_room_no === TEST_ROOM) ||
      itemsAfter[0];
    result.apiSamples.afterRegister = { status: apiAfter.status(), matched: pickGuestMatchFields(matched) };

    if (!result.guestMatchCases.exact) {
      const ex = itemsAfter.find((i) => i.guestMatch?.status === 'exact');
      if (ex) result.guestMatchCases.exact = pickGuestMatchFields(ex);
    }
    if (!result.guestMatchCases.none) {
      const no = itemsAfter.find((i) => i.guestMatch?.status === 'none');
      if (no) result.guestMatchCases.none = pickGuestMatchFields(no);
    }

    await page.screenshot({ path: SHOT_GUESTMATCH, fullPage: false });

    const storeBtn = listItem.getByRole('button', { name: '보관 처리' });
    if (await storeBtn.isVisible().catch(() => false)) {
      await storeBtn.click();
      await page.waitForTimeout(2500);
      result.steps.push({ step: 4, action: 'store', url: page.url() });
      await page.screenshot({ path: SHOT_STORED, fullPage: false });
    }

    const stayedOnChat = page.url().includes('/chat') && !page.url().includes('/ops/lost-found');
    const noOpsNav = !navigations.some((u) => /\/ops\/lost-found/.test(u));
    const gm = matched?.guestMatch;

    result.steps.push({
      step: 5,
      stayedOnChat,
      noOpsNav,
      guestMatchStatus: gm?.status ?? null,
      hasExactCase: Boolean(result.guestMatchCases.exact),
      hasNoneCase: Boolean(result.guestMatchCases.none)
    });

    result.passed =
      stayedOnChat &&
      noOpsNav &&
      hasGuestMatchUi &&
      Boolean(gm?.status) &&
      Boolean(result.guestMatchCases.exact) &&
      Boolean(result.guestMatchCases.none);
  } catch (e) {
    result.errors.push(e instanceof Error ? e.message : String(e));
    await page.screenshot({ path: SHOT_GUESTMATCH, fullPage: false }).catch(() => null);
  }

  result.screenshots = {
    registered: SHOT_REGISTERED,
    guestMatch: SHOT_GUESTMATCH,
    stored: SHOT_STORED
  };
  writeFileSync(OUT_JSON, JSON.stringify(result, null, 2));
  console.log('=== PRODUCTION STAY-JOURNAL E2E ===');
  console.log(JSON.stringify(result, null, 2));

  await browser.close();
  if (!result.passed) process.exit(1);
}

main().catch((e) => {
  console.error('[FATAL]', e);
  process.exit(1);
});
