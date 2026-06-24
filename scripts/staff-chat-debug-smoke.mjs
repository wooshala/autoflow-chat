/**
 * Smoke: /staff-chat?debug=1 must not show Next.js application error.
 * Usage: node scripts/staff-chat-debug-smoke.mjs [baseUrl]
 */
import puppeteer from 'puppeteer';

const base = process.argv[2] || 'http://localhost:3000';
const url = `${base.replace(/\/$/, '')}/staff-chat?debug=1&t=smoke`;

let browser;
try {
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 2500));

  const bodyText = await page.evaluate(() => document.body?.innerText || '');
  const hasAppError =
    bodyText.includes('Application error') ||
    bodyText.includes('a client-side exception has occurred');
  const hasDebugBar = bodyText.includes('DEBUG');

  console.log(JSON.stringify({ url, hasAppError, hasDebugBar, errorCount: errors.length, errors: errors.slice(0, 5) }, null, 2));

  if (hasAppError) process.exit(1);
  if (!hasDebugBar) {
    console.warn('WARN: DEBUG bar not found (invite may block UI but page should not crash)');
  }
  process.exit(errors.some((e) => e.includes('Minified React error')) ? 1 : 0);
} catch (e) {
  console.error('SMOKE_FAILED', e);
  process.exit(1);
} finally {
  await browser?.close();
}
