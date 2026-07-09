/**
 * Preview E2E: lost-found register + auto guestMatch on Event Center card.
 * Usage: PREVIEW_BASE=https://xxx.vercel.app node scripts/verify-preview-stay-journal-e2e.mjs
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = (process.env.PREVIEW_BASE || '').replace(/\/$/, '');
const BYPASS = process.env.VERCEL_PROTECTION_BYPASS || 'Fi6Wuf8lQ8ARpuop67POAVLAGxH5qYGN';
const TEST_ROOM = process.env.E2E_ROOM_NO || '607';
const SHOT_REGISTERED = join(__dirname, 'preview-stay-journal-registered.png');
const SHOT_GUESTMATCH = join(__dirname, 'preview-stay-journal-guestmatch.png');
const OUT_JSON = join(__dirname, 'preview-stay-journal-e2e.json');

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
          candidates_count: gm.candidates?.length ?? 0,
          candidates: gm.candidates?.slice(0, 5)
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
  if (!BASE) {
    console.error('PREVIEW_BASE required');
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS }
  });
  await context.addInitScript(() => {
    localStorage.setItem(
      'autoflow_user_v1',
      JSON.stringify({ name: 'SJ-PREVIEW-E2E', created_at: new Date().toISOString() })
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
    previewUrl: `${BASE}/chat`,
    steps: [],
    apiSamples: {},
    guestMatchUi: {},
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
    const lfDisabled = (await lfSection.innerText()).includes('분실물 비활성');
    if (lfDisabled) {
      result.errors.push('lostFoundEnabled=false');
      throw new Error('lost found disabled');
    }

    // API probe before register
    const apiBefore = await page.request.get(`${BASE}/api/ops-events/lost-found`);
    const apiBeforeBody = apiBefore.ok() ? await apiBefore.json() : await apiBefore.text();
    result.apiSamples.beforeRegister = {
      status: apiBefore.status(),
      items_count: apiBeforeBody?.data?.items?.length ?? apiBeforeBody?.items?.length ?? null,
      first_guestMatch: pickGuestMatchFields(
        (apiBeforeBody?.data?.items || apiBeforeBody?.items || [])[0]
      )
    };

    await selectRoom(page, TEST_ROOM);

    const fileInput = page.locator('input[type="file"][accept="image/*"]');
    await fileInput.setInputFiles({
      name: 'e2e-stay-journal.png',
      mimeType: 'image/png',
      buffer: TINY_PNG
    });
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: '▶' }).click();
    await page.waitForTimeout(8000);
    result.steps.push({ step: 2, action: `upload+send room ${TEST_ROOM}`, url: page.url() });

    const registerBtn = page.getByRole('button', { name: /🧳 분실물$/ }).first();
    await registerBtn.waitFor({ state: 'visible', timeout: 20000 });
    await registerBtn.click();
    await page.waitForTimeout(5000);
    result.steps.push({ step: 3, action: 'register lost-found', url: page.url() });

    const openFilter = lfSection.getByRole('button', { name: '미해결' });
    if (await openFilter.isVisible().catch(() => false)) await openFilter.click();

    const listItem = lfSection.locator('li').filter({ hasText: /LF-/ }).first();
    await listItem.waitFor({ state: 'visible', timeout: 20000 });
    const cardText = await listItem.innerText();
    const eventNo = (cardText.match(/LF-\d{6}/) || [])[0] || null;
    result.steps.push({ step: 4, eventNo, cardPreview: cardText.slice(0, 600) });
    await page.screenshot({ path: SHOT_REGISTERED, fullPage: false });

    // API after register
    const apiAfter = await page.request.get(`${BASE}/api/ops-events/lost-found`);
    const apiAfterJson = apiAfter.ok() ? await apiAfter.json() : null;
    const items = apiAfterJson?.data?.items || apiAfterJson?.items || [];
    const matchedItem =
      items.find((x) => x.event_no === eventNo) || items.find((x) => x.snap_room_no === TEST_ROOM) || items[0];
    result.apiSamples.afterRegister = {
      status: apiAfter.status(),
      matched: pickGuestMatchFields(matchedItem)
    };

    // UI guest match block checks
    const gmBlock = listItem.locator('div').filter({ hasText: /★|숙박일지|후보|매칭/ }).first();
    const gmVisible = await gmBlock.isVisible().catch(() => false);
    const gmText = gmVisible ? await gmBlock.innerText() : cardText;
    result.guestMatchUi = {
      visible: gmVisible,
      hasStars: /★/.test(gmText),
      hasRoom: new RegExp(`${TEST_ROOM}호`).test(cardText),
      hasReporterOrTime: /발견|·/.test(cardText),
      hasSegmentOrGuest: /숙박|대실|고객|전화|예약|입실|퇴실|매칭|후보/.test(gmText),
      text: gmText.slice(0, 500)
    };

    await page.screenshot({ path: SHOT_GUESTMATCH, fullPage: false });

    const stayedOnChat = page.url().includes('/chat') && !page.url().includes('/ops/lost-found');
    const noOpsNav = !navigations.some((u) => /\/ops\/lost-found/.test(u));
    const gm = matchedItem?.guestMatch;
    const hasGuestMatchField = Boolean(gm && gm.status);
    const uiShowsMatch = gmVisible || /숙박일지/.test(cardText);

    result.steps.push({
      step: 5,
      stayedOnChat,
      noOpsNav,
      hasGuestMatchField,
      uiShowsMatch,
      guestMatchStatus: gm?.status ?? null
    });

    result.passed =
      stayedOnChat &&
      noOpsNav &&
      Boolean(eventNo) &&
      hasGuestMatchField &&
      uiShowsMatch &&
      ['exact', 'multiple', 'none', 'unavailable'].includes(gm?.status);
  } catch (e) {
    result.errors.push(e instanceof Error ? e.message : String(e));
    await page.screenshot({ path: SHOT_GUESTMATCH, fullPage: false }).catch(() => null);
  }

  result.screenshots = { registered: SHOT_REGISTERED, guestMatch: SHOT_GUESTMATCH };
  writeFileSync(OUT_JSON, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));

  await browser.close();
  if (!result.passed) process.exit(1);
}

main().catch((e) => {
  console.error('[FATAL]', e);
  process.exit(1);
});
