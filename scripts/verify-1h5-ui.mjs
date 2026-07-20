import puppeteer from 'puppeteer';
const B = 'http://localhost:3011';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rec = (i, p, d = '') => console.log(`[${p ? 'PASS' : 'FAIL'}] ${i}${d ? ' — ' + d : ''}`);
const bw = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });

// A. fresh channel, no preferred → selection screen → pick 日本語 → chat
{
  const ch = 'room-1h5-ui-' + Math.floor(1000 + 8999 * 0.5); // stable-ish per run
  const p = await bw.newPage();
  await p.goto(`${B}/g/${ch}`, { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(2500);
  const t1 = await p.evaluate(() => document.body.innerText);
  rec('A. 무-preferred → 언어 선택 화면', /언어를 선택해 주세요|Please select your language/.test(t1) && t1.includes('日本語'));
  await p.evaluate(() => { const b = Array.from(document.querySelectorAll('button')).find((x) => (x.textContent || '').includes('日本語')); b && b.click(); });
  await sleep(2500);
  const t2 = await p.evaluate(() => document.body.innerText);
  const hasInput = await p.evaluate(() => Array.from(document.querySelectorAll('textarea')).some((x) => (x.placeholder || '').includes('メッセージを入力')));
  rec('A. 선택 후 채팅 진입(일본어 UI)', hasInput && !/언어を選択|언어를 선택/.test(t2));
  // B. reload → server has ja now → 바로 채팅
  await p.reload({ waitUntil: 'networkidle2' });
  await sleep(2500);
  const reloaded = await p.evaluate(() => Array.from(document.querySelectorAll('textarea')).some((x) => (x.placeholder || '').includes('メッセージを入力')));
  const stillSelecting = await p.evaluate(() => /언어를 선택해 주세요/.test(document.body.innerText));
  rec('B. 새로고침 → 선택 생략, 바로 채팅', reloaded && !stillSelecting);
  await p.close();
}

// C. server null + stale localStorage → MUST still show selection (no auto-apply)
{
  const ch = 'room-1h5-stale-x';
  const p = await bw.newPage();
  await p.evaluateOnNewDocument((k) => localStorage.setItem(k, 'en'), `guest-chat-language:${ch}`);
  await p.goto(`${B}/g/${ch}`, { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(2500);
  const t = await p.evaluate(() => document.body.innerText);
  const selecting = /언어를 선택해 주세요/.test(t);
  const noChat = !(await p.evaluate(() => Array.from(document.querySelectorAll('textarea')).length > 0));
  rec('C. 서버 null + stale localStorage → 자동진입 안 함(선택화면)', selecting && noChat);
  await p.close();
}

// D. /chat 308 (no override) → dynamic language label + duplicate-poll check
{
  const p = await bw.newPage();
  await p.setViewport({ width: 1400, height: 900 });
  await p.evaluateOnNewDocument(() => localStorage.setItem('autoflow_user_v1', JSON.stringify({ name: '검증', created_at: new Date(0).toISOString() })));
  let metaOpen308 = 0, fullOpen308 = 0;
  await p.goto(`${B}/chat`, { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(1500);
  const listLabel = await p.evaluate(() => document.body.innerText.includes('中文(简体)'));
  rec('D. 좌측 목록 308 동적 언어(中文(简体))', listLabel);
  // open 308 then observe polling for ~6s
  await p.evaluate(() => { const b = Array.from(document.querySelectorAll('button')).find((x) => (x.className || '').includes('flex-col') && (x.textContent || '').includes('308호')); b && b.click(); });
  p.on('request', (r) => {
    const u = r.url();
    if (u.includes('/api/guest/room-308/messages')) { if (u.includes('meta=1')) metaOpen308++; else fullOpen308++; }
  });
  await sleep(6000);
  const t = await p.evaluate(() => document.body.innerText);
  rec('D. 열린 308 헤더 동적 언어 표시', t.includes('中文(简体)'));
  rec('D. 열린 방 중복 meta 폴링 없음 (full만)', metaOpen308 === 0 && fullOpen308 > 0, `meta=${metaOpen308} full=${fullOpen308}`);
  await p.close();
}
await bw.close();
