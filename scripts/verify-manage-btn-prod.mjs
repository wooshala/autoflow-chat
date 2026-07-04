/**
 * Production verification: always-visible manage button + toggle close.
 */
import puppeteer from 'puppeteer';

const BASE = process.env.BASE_URL || 'https://autoflow-mvp.vercel.app';
const fakeUser = JSON.stringify({ name: 'ProdVerify', created_at: new Date().toISOString() });

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });

const results = {};
try {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2', timeout: 90000 });
  await page.evaluate((u) => localStorage.setItem('autoflow_user_v1', u), fakeUser);

  const chatRes = await page.goto(`${BASE}/chat`, { waitUntil: 'networkidle2', timeout: 90000 });
  results.chat_http = chatRes?.status() === 200;

  const staffRes = await page.goto(`${BASE}/staff-chat`, { waitUntil: 'networkidle2', timeout: 90000 });
  results.staff_chat_http = staffRes?.status() === 200;

  await page.goto(`${BASE}/chat`, { waitUntil: 'networkidle2', timeout: 90000 });
  await new Promise((r) => setTimeout(r, 4000));

  const def = await page.evaluate(() => ({
    hasManageBtn: Array.from(document.querySelectorAll('button')).some((b) => b.textContent?.trim() === '관리'),
    hasRevBanner: Boolean(document.querySelector('[data-testid="chat-deploy-rev"]'))
  }));
  results.manage_btn_visible = def.hasManageBtn;
  results.debug_hidden_default = !def.hasRevBanner;

  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.trim() === '관리');
    btn?.click();
  });
  await new Promise((r) => setTimeout(r, 1500));
  const opened = await page.evaluate(() => ({
    hasRevBanner: Boolean(document.querySelector('[data-testid="chat-deploy-rev"]')),
    hasNotifyDiag: (document.body.innerText || '').includes('알림 진단'),
    label: Array.from(document.querySelectorAll('button'))
      .map((b) => b.textContent?.trim())
      .find((t) => t === '관리' || t === '관리 닫기')
  }));
  results.debug_panel_opens = opened.hasRevBanner && opened.hasNotifyDiag;

  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.trim() === '관리 닫기');
    btn?.click();
  });
  await new Promise((r) => setTimeout(r, 1000));
  const closed = await page.evaluate(() => ({
    hasRevBanner: Boolean(document.querySelector('[data-testid="chat-deploy-rev"]')),
    hasManageBtn: Array.from(document.querySelectorAll('button')).some((b) => b.textContent?.trim() === '관리')
  }));
  results.debug_panel_closes = !closed.hasRevBanner && closed.hasManageBtn;
} catch (e) {
  results.error = e instanceof Error ? e.message : String(e);
} finally {
  await browser.close();
}

console.log(JSON.stringify({ base: BASE, results }, null, 2));
const keys = Object.keys(results).filter((k) => k !== 'error');
process.exit(keys.every((k) => results[k] === true) ? 0 : 1);
