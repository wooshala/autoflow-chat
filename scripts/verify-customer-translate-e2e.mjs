/**
 * Phase 1F.13 — customer translation (no staff login) real-browser + route verification.
 * Drives /customer-console (NEXT_PUBLIC_CUSTOMER_SERVICE_CONSOLE=1) with NO staff session
 * token in localStorage, and hits the route directly to check the Origin guard.
 *
 * Verifies:
 *   Browser: no 직원 인증 modal · POST fires · NO Authorization header · Origin present ·
 *            200 real translation · input cleared · failure(500) → append 0 + draft kept.
 *   Route:   same-origin 200 for ja/en/zh-CN/ru · cross-origin 403 · no-Origin 403.
 *
 * Usage: BASE=http://localhost:3011 node scripts/verify-customer-translate-e2e.mjs
 */
import puppeteer from 'puppeteer';

const BASE = process.env.BASE || 'http://localhost:3011';
const ORIGIN = new URL(BASE).origin;
const TRANSLATE = '/api/customer-service/translate';
const TOKEN_KEY = 'autoflow_staff_session_token_v1';

const results = [];
function record(item, pass, detail = '') {
  results.push({ item, pass, detail });
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${item}${detail ? ` — ${detail}` : ''}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function routePost({ origin, body }) {
  const headers = { 'Content-Type': 'application/json' };
  if (origin) headers.Origin = origin;
  const res = await fetch(`${BASE}${TRANSLATE}`, { method: 'POST', headers, body: JSON.stringify(body) });
  let json = null;
  try {
    json = await res.json();
  } catch {}
  return { status: res.status, json };
}

async function newConsolePage(browser) {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument((key) => {
    try {
      localStorage.removeItem(key); // ensure NO staff session token
    } catch {}
  }, TOKEN_KEY);
  await page.goto(`${BASE}/customer-console`, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForSelector('textarea', { timeout: 15000 });
  return page;
}
const textareaValue = (page) => page.$eval('textarea', (el) => el.value);
const hasAuthButton = (page) =>
  page.evaluate(() => Array.from(document.querySelectorAll('button')).some((b) => b.textContent.trim() === '직원 인증'));
const hasAuthModal = (page) => page.$('[role="dialog"][aria-label="직원 인증"]').then((el) => el !== null);

async function main() {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  try {
    // ── Browser: no login, real 200 translation ──────────────────────────────────
    {
      const page = await newConsolePage(browser);
      let reqHeaders = null;
      let translateStatus = null;
      page.on('request', (req) => {
        if (req.method() === 'POST' && req.url().includes(TRANSLATE)) reqHeaders = req.headers();
      });
      page.on('response', (res) => {
        if (res.url().includes(TRANSLATE) && res.request().method() === 'POST') translateStatus = res.status();
      });
      const draft = '수건을 곧 가져다 드리겠습니다';
      const ta = await page.$('textarea');
      await ta.click();
      await ta.type(draft);
      await page.keyboard.press('Enter');
      await sleep(6000); // real OpenAI round-trip
      record('B1. 직원 인증 modal 미표시', !(await hasAuthModal(page)) && !(await hasAuthButton(page)), '');
      record('B1. translate POST 발생', reqHeaders !== null, '');
      record('B1. Authorization 헤더 없음', !!reqHeaders && !reqHeaders['authorization'], `auth=${reqHeaders && reqHeaders['authorization']}`);
      // Note: the browser attaches Origin AFTER puppeteer's JS-level header snapshot (it is a
      // forbidden header), so reqHeaders['origin'] is undefined here. The correct proof that
      // the browser sent a matching Origin is that this same-origin POST returned 200 while
      // the route tests below prove wrong/missing Origin → 403.
      record('B1. same-origin 200 (Origin guard 통과)', translateStatus === 200, `status=${translateStatus}`);
      record('B1. 성공 후 입력창 초기화', (await textareaValue(page)) === '', '');
      await page.close();
    }

    // ── Browser: failure (500) → append 0 + draft kept ───────────────────────────
    {
      const page = await newConsolePage(browser);
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        if (req.method() === 'POST' && req.url().includes(TRANSLATE)) {
          req.respond({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, error: { code: 'TRANSLATION_ERROR' } }) });
        } else {
          req.continue();
        }
      });
      const draft = '실패 시 초안 유지 확인';
      const ta = await page.$('textarea');
      await ta.click();
      await ta.type(draft);
      await page.keyboard.press('Enter');
      await sleep(1500);
      const kept = (await textareaValue(page)) === draft;
      const failMsg = await page.evaluate(() => document.body.innerText.includes('번역에 실패했습니다'));
      record('B2. 실패 시 입력값 유지 (append 0)', kept, '');
      record('B2. 실패 안내 문구 표시', failMsg, '');
      await page.close();
    }

    // ── Route: cross-origin 403 · no-Origin 403 (checked BEFORE 4-lang to avoid rate cost) ─
    {
      const cross = await routePost({ origin: 'http://evil.example.com', body: { text: '안녕', from: 'ko', to: 'ja' } });
      record('R. 다른 origin → 403', cross.status === 403, `status=${cross.status} code=${cross.json?.error?.code}`);
      const none = await routePost({ origin: null, body: { text: '안녕', from: 'ko', to: 'ja' } });
      record('R. Origin 없음(curl) → 403', none.status === 403, `status=${none.status} code=${none.json?.error?.code}`);
      const badLang = await routePost({ origin: ORIGIN, body: { text: '안녕', from: 'ko', to: 'xx' } });
      record('R. 미지원 언어 → 400', badLang.status === 400, `status=${badLang.status}`);
      const empty = await routePost({ origin: ORIGIN, body: { text: '   ', from: 'ko', to: 'ja' } });
      record('R. 공백 text → 400', empty.status === 400, `status=${empty.status}`);
    }

    // ── Route: same-origin 200 real translation for four guest languages ──────────
    {
      const langs = ['ja', 'en', 'zh-CN', 'ru'];
      for (const to of langs) {
        const r = await routePost({ origin: ORIGIN, body: { text: '체크아웃은 오전 11시입니다', from: 'ko', to } });
        const ok = r.status === 200 && typeof r.json?.translatedText === 'string' && r.json.translatedText.trim().length > 0;
        record(`R. same-origin 200 · ko→${to}`, ok, ok ? `"${r.json.translatedText}"` : `status=${r.status}`);
      }
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
