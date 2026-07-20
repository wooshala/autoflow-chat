// Phase 1H.3 — Production verification against autoflow-mvp.vercel.app (public, the URL
// the installed EXE loads). Staff /chat uses NO room-nav override → proves the Production
// build flag NEXT_PUBLIC_ROOM_NAVIGATION=1 (same condition the EXE has).
import puppeteer from 'puppeteer';
const PROD = 'https://autoflow-mvp.vercel.app';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rec = (i, p, d = '') => console.log(`[${p ? 'PASS' : 'FAIL'}] ${i}${d ? ' — ' + d : ''}`);

const msgs = await (await fetch(`${PROD}/api/guest/room-308-live/messages`)).json().then((j) => j.messages);
const g0 = msgs.find((m) => m.sender === 'guest');
const s0 = msgs.find((m) => m.sender === 'staff');

const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });

// Staff /chat — user only, NO override (EXE-equivalent)
{
  const p = await b.newPage();
  await p.setViewport({ width: 1400, height: 900 });
  await p.evaluateOnNewDocument(() => localStorage.setItem('autoflow_user_v1', JSON.stringify({ name: '검증직원', created_at: new Date(0).toISOString() })));
  await p.goto(`${PROD}/chat`, { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(2500);
  const has308 = await p.evaluate(() => document.body.innerText.includes('308호'));
  rec('PROD /chat: room-nav ON + 308방 노출 (override 없이 = EXE 조건)', has308);
  const clicked = await p.evaluate(() => { const btn = Array.from(document.querySelectorAll('button')).find((x) => (x.className || '').includes('flex-col') && (x.textContent || '').includes('308호')); if (btn) { btn.click(); return true; } return false; });
  await sleep(2500);
  const t = await p.evaluate(() => document.body.innerText);
  const ph = await p.evaluate(() => Array.from(document.querySelectorAll('textarea')).map((x) => x.placeholder));
  rec('PROD Staff: 고객 한국어 primary', g0 && t.includes(g0.translated.ko), g0 && g0.translated.ko);
  rec('PROD Staff: 고객 일본어 secondary', g0 && t.includes(g0.original));
  rec('PROD Staff: 직원 답변 표시', s0 ? (t.includes(s0.original) && t.includes(s0.translated.ja)) : true);
  rec('PROD Staff: 입력창(GuestMessageInput)', ph.some((x) => /한국어로 답변/.test(x || '')));
  await p.close();
}
// Guest /g
{
  const p = await b.newPage();
  await p.goto(`${PROD}/g/room-308-live`, { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(2500);
  const t = await p.evaluate(() => document.body.innerText);
  rec('PROD Guest(/g): 일본어 primary + 한국어 secondary', s0 ? (t.includes(s0.translated.ja) && t.includes(s0.original)) : (g0 && t.includes(g0.original)));
  await p.close();
}
// Golden /g-staff
{
  const p = await b.newPage();
  await p.goto(`${PROD}/g-staff/room-308-live`, { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(2500);
  const t = await p.evaluate(() => document.body.innerText);
  rec('PROD Golden(/g-staff): 동일 대화', g0 && t.includes(g0.translated.ko) && t.includes(g0.original));
  await p.close();
}
await b.close();
