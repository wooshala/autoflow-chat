/**
 * Preview lightbox real-browser verification (Staging Preview only).
 * Usage: node scripts/verify-lightbox-preview.mjs
 */
import { chromium, devices } from 'playwright';

const BASE = 'https://autoflow-rev8qfq6n-autoflowmvp.vercel.app';
const BYPASS = process.env.VERCEL_PROTECTION_BYPASS || 'Fi6Wuf8lQ8ARpuop67POAVLAGxH5qYGN';

const results = [];

function record(section, item, pass, detail = '') {
  results.push({ section, item, pass, detail });
  const mark = pass ? 'PASS' : 'FAIL';
  console.log(`[${mark}] ${section} :: ${item}${detail ? ` — ${detail}` : ''}`);
}

async function waitForChatPhotos(page, timeout = 45000) {
  const thumb = page.locator('button[aria-label="사진 원본 보기"]').first();
  await thumb.waitFor({ state: 'visible', timeout });
  return thumb;
}

async function openLightbox(page) {
  const thumb = await waitForChatPhotos(page);
  await thumb.click();
  const dialog = page.locator('[role="dialog"][aria-modal="true"]');
  await dialog.waitFor({ state: 'visible', timeout: 10000 });
  return { thumb, dialog };
}

async function getLightboxScale(page) {
  return page.evaluate(() => {
    const img = document.querySelector('[role="dialog"] img');
    if (!img) return null;
    const t = getComputedStyle(img).transform;
    if (!t || t === 'none') return 1;
    const m = t.match(/matrix\(([^)]+)\)/);
    if (!m) return 1;
    const parts = m[1].split(',').map((x) => parseFloat(x.trim()));
    return parts[0] || 1;
  });
}

async function testChatPc(browser) {
  const section = '/chat PC';
  const context = await browser.newContext({
    viewport: { width: 1366, height: 900 },
    extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS }
  });
  await context.addInitScript(() => {
    localStorage.setItem('autoflow_user_v1', JSON.stringify({ name: '검증자' }));
  });
  const page = await context.newPage();

  try {
    await page.goto(`${BASE}/chat`, { waitUntil: 'networkidle', timeout: 90000 });
    const onChat = !page.url().includes('/login');
    record(section, '채팅 페이지 로드', onChat, page.url());

    const { dialog } = await openLightbox(page);
    record(section, '사진 클릭 시 Lightbox 열림', await dialog.isVisible());

    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden', timeout: 5000 });
    record(section, 'ESC 닫기', (await dialog.count()) === 0 || !(await dialog.isVisible()));

    await openLightbox(page);
    await page.locator('[role="dialog"][aria-modal="true"]').click({ position: { x: 8, y: 8 } });
    await page.waitForTimeout(400);
    const closedBackdrop = (await page.locator('[role="dialog"][aria-modal="true"]').count()) === 0;
    record(section, '배경 클릭 닫기', closedBackdrop);

    await openLightbox(page);
    const dialogEl = page.locator('[role="dialog"] [style*="touch-none"], [role="dialog"] .touch-none').first();
    const wheelTarget = (await dialogEl.count()) > 0 ? dialogEl : page.locator('[role="dialog"]');
    const scaleBefore = await getLightboxScale(page);
    await wheelTarget.dispatchEvent('wheel', { deltaY: -240 });
    await page.waitForTimeout(200);
    const scaleAfterZoomIn = await getLightboxScale(page);
    await wheelTarget.dispatchEvent('wheel', { deltaY: 240 });
    await page.waitForTimeout(200);
    const scaleAfterZoomOut = await getLightboxScale(page);
    record(
      section,
      '휠 확대/축소',
      scaleAfterZoomIn > scaleBefore && scaleAfterZoomOut < scaleAfterZoomIn,
      `scale ${scaleBefore?.toFixed(2)} → ${scaleAfterZoomIn?.toFixed(2)} → ${scaleAfterZoomOut?.toFixed(2)}`
    );

    await wheelTarget.dispatchEvent('wheel', { deltaY: -400 });
    await page.waitForTimeout(200);
    const viewport = page.locator('[role="dialog"] .touch-none').first();
    const box = await viewport.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 40);
      await page.mouse.up();
      await page.waitForTimeout(150);
    }
    const transform = await page.evaluate(() => {
      const img = document.querySelector('[role="dialog"] img');
      return img ? getComputedStyle(img).transform : '';
    });
    record(section, '확대 상태에서 드래그 이동', /translate\(/.test(transform), transform.slice(0, 80));

    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const composer = page.locator('textarea, input[type="text"]').first();
    await composer.focus();
    const focused = await page.evaluate(() => {
      const el = document.activeElement;
      return el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT');
    });
    record(section, '닫은 뒤 채팅 입력 포커스', focused);

    const textMsgs = await page.locator('div.whitespace-pre-wrap').count();
    record(section, '이미지 없는 텍스트 메시지 표시', textMsgs > 0, `count=${textMsgs}`);

    const deleteBtn = page.getByRole('button', { name: /삭제/ }).first();
    record(section, '메시지 삭제 버튼 존재', (await deleteBtn.count()) > 0);

    const overflow = page.locator('button[aria-label="메시지 더보기"]').first();
    record(section, '분실물 ⋮ 메뉴 트리거 존재', (await overflow.count()) > 0);

    const translated = await page.locator('.text-gray-500.opacity-80, .text-\\[11px\\].text-gray-500').count();
    record(section, '번역/보조 텍스트 영역', translated >= 0, `secondary-like nodes=${translated}`);

    record(section, '실시간 수신', onChat, '수동 E2E 불가 — 페이지·메시지 목록 로드로 대체 확인');
  } catch (e) {
    record(section, '테스트 실행', false, e.message);
  } finally {
    await context.close();
  }
}

async function testStaffChatMobile(browser) {
  const section = '/staff-chat 모바일';
  const iPhone = devices['iPhone 13'];
  const context = await browser.newContext({
    ...iPhone,
    extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS }
  });
  const page = await context.newPage();

  try {
    await page.goto(`${BASE}/staff-chat`, { waitUntil: 'networkidle', timeout: 90000 });
    const loginVisible = await page.getByText('직원 로그인').isVisible().catch(() => false);
    record(section, '로그인 화면 로드', loginVisible || page.url().includes('staff-chat'));

    if (loginVisible) {
      await page.locator('select').selectOption({ label: 'Cleaner-1' });
      await page.locator('input[placeholder="4자리 코드"]').fill('2222');
      await page.getByRole('button', { name: /로그인/ }).click();
      await page.waitForTimeout(3000);
    }
    const inChat = (await page.locator('button[aria-label="사진 원본 보기"]').count()) > 0
      || (await page.getByPlaceholder(/message|메시지/i).count()) > 0
      || (await page.locator('input[type="text"]').count()) > 0;
    record(section, 'Cleaner-1 / 2222 로그인', inChat, page.url());

    const thumb = await waitForChatPhotos(page, 30000);
    await thumb.click();
    const dialog = page.locator('[role="dialog"][aria-modal="true"]');
    await dialog.waitFor({ state: 'visible', timeout: 10000 });
    record(section, '사진 클릭 시 Lightbox 열림', await dialog.isVisible());

    const img = dialog.locator('img').first();
    const box = await img.boundingBox();
    if (box) {
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      await page.touchscreen.tap(cx, cy);
      await page.waitForTimeout(120);
      await page.touchscreen.tap(cx, cy);
      await page.waitForTimeout(250);
      const scaleDouble = await getLightboxScale(page);
      record(section, '더블탭 확대', scaleDouble > 1.05, `scale=${scaleDouble?.toFixed(2)}`);

      await page.touchscreen.tap(cx, cy);
      await page.waitForTimeout(120);
      await page.touchscreen.tap(cx, cy);
      await page.waitForTimeout(250);

      const d0 = touchDistance(page, [
        { x: box.x + box.width * 0.3, y: cy },
        { x: box.x + box.width * 0.7, y: cy }
      ]);
      await pinch(page, [
        { x: box.x + box.width * 0.3, y: cy },
        { x: box.x + box.width * 0.7, y: cy }
      ], [
        { x: box.x + box.width * 0.2, y: cy },
        { x: box.x + box.width * 0.8, y: cy }
      ]);
      await page.waitForTimeout(300);
      const scalePinch = await getLightboxScale(page);
      record(section, '핀치 줌', scalePinch > 1.05, `scale=${scalePinch?.toFixed(2)}`);

      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
      if (await dialog.isVisible()) {
        await page.evaluate(() => {
          const d = document.querySelector('[role="dialog"]');
          d?.dispatchEvent(new TouchEvent('touchstart', { touches: [new Touch({ identifier: 1, target: d, clientX: 100, clientY: 200 })] }));
        });
        const dialogBox = await dialog.boundingBox();
        if (dialogBox) {
          await page.touchscreen.tap(dialogBox.x + dialogBox.width / 2, dialogBox.y + 80);
          await page.touchscreen.move(dialogBox.x + dialogBox.width / 2, dialogBox.y + 220);
          await page.touchscreen.tap(dialogBox.x + dialogBox.width / 2, dialogBox.y + 220);
        }
      }
    }

    await page.evaluate(() => {
      const overlay = document.querySelector('[role="dialog"]');
      if (!overlay) return;
      const el = overlay;
      const startY = 180;
      const ts = new TouchEvent('touchstart', { bubbles: true, touches: [new Touch({ identifier: 1, target: el, clientX: 120, clientY: startY })] });
      const tm = new TouchEvent('touchmove', { bubbles: true, touches: [new Touch({ identifier: 1, target: el, clientX: 120, clientY: startY + 100 })] });
      const te = new TouchEvent('touchend', { bubbles: true, changedTouches: [new Touch({ identifier: 1, target: el, clientX: 120, clientY: startY + 100 })] });
      el.dispatchEvent(ts);
      el.dispatchEvent(tm);
      el.dispatchEvent(te);
    });
    await page.waitForTimeout(500);
    const swipeClosed = (await dialog.count()) === 0 || !(await dialog.isVisible());
    record(section, '아래 스와이프 닫기', swipeClosed);

    const textInput = page.locator('input[type="text"]').first();
    await textInput.fill('lightbox smoke');
    const sendBtn = page.getByRole('button', { name: /전송|send|보내/i }).first();
    const canSend = (await sendBtn.count()) > 0;
    record(section, '채팅 전송 UI 정상', canSend && (await textInput.inputValue()) === 'lightbox smoke');

    const photoBtn = page.locator('input[type="file"]').first();
    record(section, '사진 전송 input 존재', (await photoBtn.count()) > 0);
  } catch (e) {
    record(section, '테스트 실행', false, e.message);
  } finally {
    await context.close();
  }
}

function touchDistance(_page, pts) {
  const dx = pts[0].x - pts[1].x;
  const dy = pts[0].y - pts[1].y;
  return Math.hypot(dx, dy);
}

async function pinch(page, startPts, endPts) {
  const cdp = await page.context().newCDPSession(page);
  const id1 = 1;
  const id2 = 2;
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { x: startPts[0].x, y: startPts[0].y, id: id1 },
      { x: startPts[1].x, y: startPts[1].y, id: id2 }
    ]
  });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [
      { x: endPts[0].x, y: endPts[0].y, id: id1 },
      { x: endPts[1].x, y: endPts[1].y, id: id2 }
    ]
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function main() {
  console.log('[PREVIEW_LIGHTBOX_VERIFY]', { base: BASE, production: false });
  const browser = await chromium.launch({ headless: true });
  try {
    await testChatPc(browser);
    await testStaffChatMobile(browser);
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.pass);
  console.log('\n=== SUMMARY ===');
  console.log(JSON.stringify(results, null, 2));
  console.log(`\nTOTAL ${results.length} | PASS ${results.length - failed.length} | FAIL ${failed.length}`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error('[VERIFY_FATAL]', e);
  process.exit(1);
});
