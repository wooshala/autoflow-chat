/**
 * Production E2E: Phase A — lightbox + lost-found PATCH edit.
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = (process.env.PRODUCTION_BASE || 'https://autoflow-mvp.vercel.app').replace(/\/$/, '');
const BYPASS = process.env.VERCEL_PROTECTION_BYPASS || 'Fi6Wuf8lQ8ARpuop67POAVLAGxH5qYGN';
const OUT_JSON = join(__dirname, 'production-phase-a-e2e.json');
const SHOT_LIGHTBOX = join(__dirname, 'production-phase-a-lightbox.png');
const SHOT_EDIT = join(__dirname, 'production-phase-a-edit.png');

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS }
  });
  await context.addInitScript(() => {
    localStorage.setItem(
      'autoflow_user_v1',
      JSON.stringify({ name: 'PHASE-A-E2E', created_at: new Date().toISOString() })
    );
  });

  const page = await context.newPage();
  page.on('dialog', async (d) => {
    await d.accept();
  });

  const result = { base: `${BASE}/chat`, steps: [], passed: false, errors: [] };

  try {
    await page.goto(`${BASE}/chat`, { waitUntil: 'networkidle', timeout: 120000 });
    await page.waitForTimeout(4000);
    await page.getByText('Event Center', { exact: true }).waitFor({ state: 'visible', timeout: 30000 });

    const lfSection = page.locator('#event-center-lost-found');
    await lfSection.getByRole('button', { name: '전체' }).click();
    await page.waitForTimeout(400);

    const listItem = lfSection.locator('li').filter({ hasText: /LF-/ }).first();
    await listItem.waitFor({ state: 'visible', timeout: 20000 });

    // 1. Lightbox
    const thumb = listItem.locator('button[aria-label="사진 원본 보기"]').first();
    const hasThumb = await thumb.isVisible().catch(() => false);
    if (hasThumb) {
      await thumb.click();
      await page.waitForTimeout(500);
      const dialog = page.getByRole('dialog');
      const lightboxOpen = await dialog.isVisible().catch(() => false);
      result.steps.push({ step: 1, lightboxOpen, url: page.url() });
      await page.screenshot({ path: SHOT_LIGHTBOX, fullPage: false });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
    } else {
      result.steps.push({ step: 1, lightboxOpen: false, skipped: 'no image thumb' });
    }

    // 2. Edit room + description
    const editBtn = listItem.getByRole('button', { name: '수정' });
    await editBtn.waitFor({ state: 'visible', timeout: 10000 });
    await editBtn.click();
    await page.waitForTimeout(300);

    const editDialog = page.getByRole('dialog', { name: /수정/ });
    await editDialog.waitFor({ state: 'visible', timeout: 5000 });
    await editDialog.locator('#lf-edit-room').fill('309');
    const prevDesc = await editDialog.locator('#lf-edit-desc').inputValue();
    await editDialog.locator('#lf-edit-desc').fill(`${prevDesc} [phase-a]`);
    await editDialog.locator('#lf-edit-memo').fill('E2E phase-a memo');

    await editDialog.getByRole('button', { name: '저장' }).click();
    await page.waitForTimeout(3000);
    result.steps.push({ step: 2, action: 'patch save', url: page.url() });
    await page.screenshot({ path: SHOT_EDIT, fullPage: false });

    const cardText = await listItem.innerText();
    const has309 = cardText.includes('309호');
    const hasMemo = cardText.includes('E2E phase-a memo') || cardText.includes('[phase-a]');
    result.steps.push({ step: 3, has309, hasMemo, cardPreview: cardText.slice(0, 400) });

    // 3. guestMatch still present
    const hasGuestMatch = /★|숙박일지/.test(cardText);
    result.steps.push({ step: 4, hasGuestMatch });

    // 4. store still works if registered
    const storeBtn = listItem.getByRole('button', { name: '보관 처리' });
    if (await storeBtn.isVisible().catch(() => false)) {
      await storeBtn.click();
      await page.waitForTimeout(2000);
      result.steps.push({ step: 5, storeClicked: true, url: page.url() });
    }

    const stayedOnChat = page.url().includes('/chat') && !page.url().includes('/ops/');
    result.steps.push({ step: 6, stayedOnChat, url: page.url() });

    result.passed =
      stayedOnChat &&
      (hasThumb ? result.steps.some((s) => s.step === 1 && s.lightboxOpen) : true) &&
      has309 &&
      hasMemo &&
      hasGuestMatch;
  } catch (e) {
    result.errors.push(e instanceof Error ? e.message : String(e));
  }

  writeFileSync(OUT_JSON, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
  if (!result.passed) process.exit(1);
}

main().catch((e) => {
  console.error('[FATAL]', e);
  process.exit(1);
});
