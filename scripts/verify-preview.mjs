// Phase 1H.3 — Preview verification (autoflow-mvp branch preview). Uses the protection
// bypass header on every request. Checks Guest / Staff(/chat 308) / Golden(/g-staff),
// a live write, and translation round trip on the deployed Preview.
import puppeteer from 'puppeteer';

const PV = process.env.PV;
const BYPASS = process.env.BYPASS;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rec = (i, p, d = '') => console.log(`[${p ? 'PASS' : 'FAIL'}] ${i}${d ? ' — ' + d : ''}`);

const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });

// live write via Preview API (proves deployed write path + shared DB)
const api = `${PV}/api/guest/room-308-live/messages`;
const writeRes = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-vercel-protection-bypass': BYPASS }, body: JSON.stringify({ text: 'プレビュー確認テスト', sender: 'guest', lang: 'ja' }) });
rec('Preview 쓰기(POST 201)', writeRes.status === 201, `HTTP ${writeRes.status}`);
const written = (await writeRes.json()).message;
rec('Preview 번역 생성(ja→ko)', Boolean(written?.translated?.ko), written?.translated?.ko || '');

const msgs = await (await fetch(api, { headers: { 'x-vercel-protection-bypass': BYPASS } })).json().then((j) => j.messages);
const g0 = msgs.find((m) => m.sender === 'guest');
const s0 = msgs.find((m) => m.sender === 'staff');

async function newPage() {
  const p = await b.newPage();
  await p.setViewport({ width: 1400, height: 900 });
  await p.setExtraHTTPHeaders({ 'x-vercel-protection-bypass': BYPASS });
  await p.evaluateOnNewDocument(() => {
    localStorage.setItem('autoflow_user_v1', JSON.stringify({ name: '검증직원', created_at: new Date(0).toISOString() }));
    localStorage.setItem('AUTOFLOW_ROOM_NAV_OVERRIDE', 'on');
  });
  return p;
}

// Staff: /chat 308
{
  const p = await newPage();
  await p.goto(`${PV}/chat`, { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(1500);
  const clicked = await p.evaluate(() => { const btn = Array.from(document.querySelectorAll('button')).find((x) => (x.className || '').includes('flex-col') && (x.textContent || '').includes('308호')); if (btn) { btn.click(); return true; } return false; });
  rec('Preview /chat: 308방 존재+선택(room-nav 빌드 플래그 ON)', clicked);
  await sleep(2500);
  const t = await p.evaluate(() => document.body.innerText);
  rec('Preview Staff: 고객 한국어 primary', g0 && t.includes(g0.translated.ko));
  rec('Preview Staff: 고객 일본어 secondary', g0 && t.includes(g0.original));
  rec('Preview Staff: 입력창 존재', /한국어로 답변/.test(t));
  await p.close();
}
// Guest: /g
{
  const p = await newPage();
  await p.goto(`${PV}/g/room-308-live`, { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(2500);
  const t = await p.evaluate(() => document.body.innerText);
  rec('Preview Guest(/g): 대화 표시', g0 && t.includes(g0.original) && (s0 ? t.includes(s0.translated.ja) : true));
  await p.close();
}
// Golden: /g-staff
{
  const p = await newPage();
  await p.goto(`${PV}/g-staff/room-308-live`, { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(2500);
  const t = await p.evaluate(() => document.body.innerText);
  rec('Preview Golden(/g-staff): 동일 대화', g0 && t.includes(g0.translated.ko) && t.includes(g0.original));
  await p.close();
}
await b.close();
