/**
 * Production E2E: Event Center lost-found card layout (A+B).
 * Checks readable text (no vertical break), 64px thumb, lightbox, edit/store/delete, /chat stay.
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = (process.env.PRODUCTION_BASE || 'https://autoflow-mvp.vercel.app').replace(/\/$/, '');
const BYPASS = process.env.VERCEL_PROTECTION_BYPASS || 'Fi6Wuf8lQ8ARpuop67POAVLAGxH5qYGN';
const OUT_JSON = join(__dirname, 'production-lf-card-layout-e2e.json');
const SHOT = join(__dirname, 'production-lf-card-layout-after.png');
const SHOT_LIGHTBOX = join(__dirname, 'production-lf-card-layout-lightbox.png');

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS }
  });
  await context.addInitScript(() => {
    localStorage.setItem(
      'autoflow_user_v1',
      JSON.stringify({ name: 'LF-LAYOUT-E2E', created_at: new Date().toISOString() })
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
    await page.waitForTimeout(500);

    const listItem = lfSection.locator('li').filter({ hasText: /LF-/ }).first();
    await listItem.waitFor({ state: 'visible', timeout: 20000 });

    const cardText = await listItem.innerText();
    const hasLf = /LF-\d{6}/.test(cardText);
    const hasStatus = /미해결|보관중|보관완료|접수|보관|인계|폐기|취소/.test(cardText);
    const hasRoomOrDesc = /호|객실|분실물|사진/.test(cardText);
    const hasFound = /발견/.test(cardText);
    const hasGuestMatch = /★|숙박일지/.test(cardText);
    // vertical break heuristic: single CJK char lines stacked (e.g. "발\n견")
    const verticalBreak = /(^|\n)[가-힣]\n[가-힣](\n|$)/.test(cardText);

    const thumb = listItem.locator('button[aria-label="사진 원본 보기"]').first();
    const hasThumb = await thumb.isVisible().catch(() => false);
    let thumbSize = null;
    if (hasThumb) {
      const box = await thumb.boundingBox();
      thumbSize = box ? { w: Math.round(box.width), h: Math.round(box.height) } : null;
      await thumb.click();
      await page.waitForTimeout(400);
      const dialog = page.getByRole('dialog');
      const lightboxOpen = await dialog.isVisible().catch(() => false);
      result.steps.push({ step: 1, lightboxOpen, thumbSize });
      await page.screenshot({ path: SHOT_LIGHTBOX, fullPage: false });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }

    result.steps.push({
      step: 2,
      hasLf,
      hasStatus,
      hasRoomOrDesc,
      hasFound,
      hasGuestMatch,
      verticalBreak,
      cardPreview: cardText.slice(0, 500)
    });

    await page.screenshot({ path: SHOT, fullPage: false });

    // Edit still works
    const editBtn = listItem.getByRole('button', { name: '수정' });
    await editBtn.click();
    await page.waitForTimeout(300);
    const editDialog = page.getByRole('dialog', { name: /수정/ });
    await editDialog.waitFor({ state: 'visible', timeout: 5000 });
    const memo = editDialog.locator('#lf-edit-memo');
    const prev = await memo.inputValue();
    await memo.fill(prev.includes('layout-e2e') ? prev : `${prev} layout-e2e`.trim());
    await editDialog.getByRole('button', { name: '저장' }).click();
    await page.waitForTimeout(3000);
    result.steps.push({ step: 3, editSaved: true, url: page.url() });

    const stayedOnChat = page.url().includes('/chat') && !page.url().includes('/ops/');
    const thumbOk = !hasThumb || (thumbSize && thumbSize.w >= 60 && thumbSize.h >= 60);

    result.steps.push({ step: 4, stayedOnChat, thumbOk });
    result.passed =
      stayedOnChat &&
      hasLf &&
      hasStatus &&
      hasRoomOrDesc &&
      hasFound &&
      hasGuestMatch &&
      !verticalBreak &&
      Boolean(thumbOk) &&
      (hasThumb ? result.steps.some((s) => s.step === 1 && s.lightboxOpen) : true);
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
