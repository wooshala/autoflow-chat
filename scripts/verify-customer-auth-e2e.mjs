/**
 * Phase 1F.12 — customer translation staff-session gate, real-browser verification.
 * Drives /customer-console (NEXT_PUBLIC_CUSTOMER_SERVICE_CONSOLE=1) against a local
 * dev server. Verifies the NEW client behavior deterministically:
 *   A. No staff session → Enter makes ZERO translate calls, shows 직원 인증, keeps draft.
 *   B. Modal 취소 → draft preserved.
 *   C. Bogus token → REAL server 401 → session cleared, append 0, draft kept.
 *   D. Valid token → Authorization: Bearer sent → 200 → append 1 (single call, no auto-resend).
 *
 * Usage: BASE=http://localhost:3000 node scripts/verify-customer-auth-e2e.mjs
 */
import puppeteer from 'puppeteer';

const BASE = process.env.BASE || 'http://localhost:3000';
const TRANSLATE = '/api/customer-service/translate';
const TOKEN_KEY = 'autoflow_staff_session_token_v1';

const results = [];
function record(item, pass, detail = '') {
  results.push({ item, pass, detail });
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${item}${detail ? ` — ${detail}` : ''}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function newConsolePage(browser, initToken) {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument((key, token) => {
    try {
      localStorage.removeItem(key);
      if (token) localStorage.setItem(key, token);
    } catch {}
  }, TOKEN_KEY, initToken || null);
  await page.goto(`${BASE}/customer-console`, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForSelector('textarea', { timeout: 15000 });
  return page;
}

async function typeReply(page, text) {
  const ta = await page.$('textarea');
  await ta.click();
  await ta.type(text);
}
async function textareaValue(page) {
  return page.$eval('textarea', (el) => el.value);
}
async function hasAuthButton(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('button')).some((b) => b.textContent.trim() === '직원 인증'),
  );
}
async function messageCount(page) {
  // Count rendered timeline bubbles by role region text nodes — fallback to any element
  // carrying the translated marker. We use the whole console text length delta instead.
  return page.evaluate(() => document.body.innerText.length);
}

async function main() {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  try {
    // ── A. No session → zero translate calls, 직원 인증 shown, draft kept ──────────
    {
      const page = await newConsolePage(browser, null);
      let translateCalls = 0;
      page.on('request', (req) => {
        if (req.method() === 'POST' && req.url().includes(TRANSLATE)) translateCalls += 1;
      });
      const draft = '방 청소를 곧 도와드리겠습니다';
      await typeReply(page, draft);
      await page.keyboard.press('Enter');
      await sleep(800);
      record('A. 세션 없음 · translate 호출 0', translateCalls === 0, `calls=${translateCalls}`);
      record('A. 직원 인증 버튼 표시', await hasAuthButton(page), '');
      record('A. 입력값 유지', (await textareaValue(page)) === draft, `value="${await textareaValue(page)}"`);
      await page.close();
    }

    // ── B. Modal 취소 → draft preserved ───────────────────────────────────────────
    {
      const page = await newConsolePage(browser, null);
      const draft = '취소 후에도 남아있어야 함';
      await typeReply(page, draft);
      await page.keyboard.press('Enter');
      await sleep(500);
      // open modal
      await page.evaluate(() => {
        const b = Array.from(document.querySelectorAll('button')).find((x) => x.textContent.trim() === '직원 인증');
        b && b.click();
      });
      await page.waitForSelector('[role="dialog"][aria-label="직원 인증"]', { timeout: 8000 });
      const modalShown = true;
      // cancel
      await page.evaluate(() => {
        const b = Array.from(document.querySelectorAll('[role="dialog"] button')).find((x) => x.textContent.trim() === '취소');
        b && b.click();
      });
      await sleep(300);
      const modalGone = (await page.$('[role="dialog"][aria-label="직원 인증"]')) === null;
      record('B. 모달 열림', modalShown, '');
      record('B. 취소 후 모달 닫힘', modalGone, '');
      record('B. 취소 후 입력값 유지', (await textareaValue(page)) === draft, '');
      await page.close();
    }

    // ── C. Bogus token → REAL server 401 → session cleared, append 0, draft kept ──
    {
      const page = await newConsolePage(browser, 'bogus-invalid-token');
      let status401 = false;
      page.on('response', async (res) => {
        if (res.url().includes(TRANSLATE) && res.request().method() === 'POST') {
          if (res.status() === 401) status401 = true;
        }
      });
      const draft = '세션 만료 시 초안 유지 확인';
      const before = await messageCount(page);
      await typeReply(page, draft);
      await page.keyboard.press('Enter');
      await sleep(2500);
      const tokenAfter = await page.evaluate((k) => localStorage.getItem(k), TOKEN_KEY);
      const after = await messageCount(page);
      record('C. 서버 401 수신', status401, '');
      record('C. 저장 토큰 제거', tokenAfter === null, `token=${tokenAfter}`);
      record('C. 입력값 유지', (await textareaValue(page)) === draft, '');
      record('C. 메시지 append 0 (근사)', Math.abs(after - before) < draft.length + 40, `ΔinnerText=${after - before}`);
      await page.close();
    }

    // ── D. Valid token → Authorization sent → 200 → append 1 (single call) ────────
    {
      const page = await newConsolePage(browser, 'valid-session-XYZ');
      await page.setRequestInterception(true);
      let sentAuth = null;
      let calls = 0;
      const translated = 'TRANSLATED_OK_1F12';
      page.on('request', (req) => {
        if (req.method() === 'POST' && req.url().includes(TRANSLATE)) {
          calls += 1;
          sentAuth = req.headers()['authorization'] || null;
          req.respond({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ ok: true, translatedText: translated }),
          });
        } else {
          req.continue();
        }
      });
      const draft = '체크아웃 시간을 안내해 드리겠습니다';
      await typeReply(page, draft);
      await page.keyboard.press('Enter');
      await sleep(1500);
      const appended = await page.evaluate((t) => document.body.innerText.includes(t), translated);
      const cleared = (await textareaValue(page)) === '';
      record('D. Authorization: Bearer 전송', sentAuth === 'Bearer valid-session-XYZ', `auth=${sentAuth}`);
      record('D. translate 호출 1회 (자동 재전송 없음)', calls === 1, `calls=${calls}`);
      record('D. 200 번역 append 1', appended, '');
      record('D. 성공 후 입력창 비움', cleared, '');
      await page.close();
    }
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n=== ${results.length - failed.length}/${results.length} PASS ===`);
  if (failed.length) {
    console.log('FAILED:', failed.map((f) => f.item).join(' | '));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('E2E ERROR', e);
  process.exit(1);
});
