// Phase 1H.2 — verify Guest Chat is integrated INTO /chat (308 pilot room).
// Drives real /chat: enable Room Nav override + fake staff name, select the 308 room,
// confirm GuestChatPanel shows the guest message (Korean for staff), reply in Korean,
// then confirm the guest side (/g) shows the reply in Japanese.
import puppeteer from 'puppeteer';

const BASE = process.env.BASE || 'http://localhost:3011';
const results = [];
const rec = (i, p, d = '') => { results.push({ i, p }); console.log(`[${p ? 'PASS' : 'FAIL'}] ${i}${d ? ' — ' + d : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 900 });
    await page.evaluateOnNewDocument(() => {
      localStorage.setItem('autoflow_user_v1', JSON.stringify({ name: '검증직원', created_at: new Date(0).toISOString() }));
      localStorage.setItem('AUTOFLOW_ROOM_NAV_OVERRIDE', 'on');
    });
    await page.goto(`${BASE}/chat`, { waitUntil: 'networkidle2', timeout: 60000 });
    rec('/chat 로드(로그인 통과)', !page.url().includes('/login'), page.url());

    // find + click the 308 room in the left nav
    await sleep(1500);
    const clicked = await page.evaluate(() => {
      // precise: the room row's onSelect button (className has flex-col) for 308호
      const btn = Array.from(document.querySelectorAll('button'))
        .find((b) => (b.className || '').includes('flex-col') && (b.textContent || '').includes('308호'));
      if (btn) { btn.click(); return true; }
      return false;
    });
    rec('좌측 308호 방 선택', clicked);
    await sleep(2500); // GuestChatPanel mounts + polls

    // guest's seeded message should show as Korean (staff view)
    const seesGuestKo = await page.evaluate(() => document.body.innerText.includes('냉장고가 차갑지 않습니다'));
    rec('GuestChatPanel: 고객 메시지 한국어 표시', seesGuestKo);
    const seesGuestJa = await page.evaluate(() => document.body.innerText.includes('冷蔵庫が冷えません'));
    rec('GuestChatPanel: 원문(일본어) secondary 표시', seesGuestJa);

    // staff replies in Korean via the panel's composer
    const reply = '기사님을 바로 보내드리겠습니다.';
    const typed = await page.evaluate((r) => {
      const ta = Array.from(document.querySelectorAll('textarea')).find((t) => /한국어로 답변/.test(t.placeholder || ''));
      if (!ta) return false;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(ta, r); ta.dispatchEvent(new Event('input', { bubbles: true })); ta.focus();
      return true;
    }, reply);
    rec('직원 입력창(GuestMessageInput) 발견', typed);
    await page.keyboard.press('Enter');
    await sleep(6000); // send + translate + poll

    const staffSeesReply = await page.evaluate((r) => document.body.innerText.includes(r), reply);
    rec('직원 화면에 답변 반영', staffSeesReply);

    // guest side sees the reply translated to Japanese
    const gp = await browser.newPage();
    await gp.goto(`${BASE}/g/room-308-live`, { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(3000);
    const guestSeesJa = await gp.evaluate(() => /冷蔵庫|お送り|すぐ|技術|スタッフ/.test(document.body.innerText) && document.body.innerText.length > 0);
    // more precise: fetch the API and check a ja translation exists for the staff reply
    const apiOk = await gp.evaluate(async () => {
      const r = await fetch('/api/guest/room-308-live/messages', { cache: 'no-store' });
      const j = await r.json();
      const staffMsg = (j.messages || []).find((m) => m.sender === 'staff');
      return Boolean(staffMsg && staffMsg.translated && staffMsg.translated.ja);
    });
    rec('게스트 화면(/g): 직원 답변 일본어 번역 존재', apiOk);

    await browser.close();
  } catch (e) {
    console.error('ERR', e.message);
    await browser.close();
    process.exit(1);
  }
  const fail = results.filter((r) => !r.p);
  console.log(`\n=== ${results.length - fail.length}/${results.length} PASS ===`);
  process.exit(fail.length ? 1 : 0);
}
main();
