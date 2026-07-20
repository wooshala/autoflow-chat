// Phase 1H.3 — data-driven UI verification (no hardcoded translations).
// Pulls the actual persisted messages, then asserts each surface renders primary+secondary.
import puppeteer from 'puppeteer';
const BASE = process.env.BASE || 'http://localhost:3011';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rec = (i, p, d = '') => console.log(`[${p ? 'PASS' : 'FAIL'}] ${i}${d ? ' — ' + d : ''}`);

const msgs = await (await fetch(`${BASE}/api/guest/room-308-live/messages`)).json().then((j) => j.messages);
const g0 = msgs.find((m) => m.sender === 'guest'); // guest ja + ko translation
const s0 = msgs.find((m) => m.sender === 'staff'); // staff ko + ja translation
console.log('data:', 'guest.ja=', g0.original, '| guest.ko=', g0.translated.ko, '|| staff.ko=', s0.original, '| staff.ja=', s0.translated.ja);

const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });

// 1) /chat 308 (staff view): ko primary + ja secondary
{
  const page = await b.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('autoflow_user_v1', JSON.stringify({ name: '검증직원', created_at: new Date(0).toISOString() }));
    localStorage.setItem('AUTOFLOW_ROOM_NAV_OVERRIDE', 'on');
  });
  await page.goto(`${BASE}/chat`, { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(1500);
  await page.evaluate(() => { const btn = Array.from(document.querySelectorAll('button')).find((x) => (x.className||'').includes('flex-col') && (x.textContent||'').includes('308호')); btn && btn.click(); });
  await sleep(2500);
  const t = await page.evaluate(() => document.body.innerText);
  rec('/chat 308: 고객 메시지 한국어(primary)', t.includes(g0.translated.ko), g0.translated.ko);
  rec('/chat 308: 고객 원문 일본어(secondary)', t.includes(g0.original));
  rec('/chat 308: 직원 답변 한국어(primary)', t.includes(s0.original));
  rec('/chat 308: 직원 답변 일본어(secondary)', t.includes(s0.translated.ja));
  await page.close();
}
// 2) /g-staff Golden Reference: same conversation, same rule
{
  const page = await b.newPage();
  await page.goto(`${BASE}/g-staff/room-308-live`, { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(2500);
  const t = await page.evaluate(() => document.body.innerText);
  rec('/g-staff: 고객 한국어 + 일본어 원문', t.includes(g0.translated.ko) && t.includes(g0.original));
  rec('/g-staff: 직원 한국어 + 일본어', t.includes(s0.original) && t.includes(s0.translated.ja));
  await page.close();
}
// 3) /g guest view: ja primary + ko secondary
{
  const page = await b.newPage();
  await page.goto(`${BASE}/g/room-308-live`, { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(2500);
  const t = await page.evaluate(() => document.body.innerText);
  rec('/g: 직원 답변 일본어(primary)', t.includes(s0.translated.ja));
  rec('/g: 직원 답변 한국어(secondary)', t.includes(s0.original));
  rec('/g: 고객 원문 일본어', t.includes(g0.original));
  await page.close();
}
await b.close();
