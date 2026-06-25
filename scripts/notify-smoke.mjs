/**
 * Starts next dev, opens /chat as desktop UA, injects a mobile-side message via /api/chat/send,
 * captures browser console lines containing CHAT_NOTIFY / CHAT_TOAST.
 *
 * Usage: node scripts/notify-smoke.mjs
 * Requires: npm install (puppeteer devDependency)
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function loadEnvLocal() {
  const p = path.join(root, '.env.local');
  const txt = fs.readFileSync(p, 'utf8');
  const out = {};
  for (const line of txt.split(/\r?\n/)) {
    if (!line || /^\s*#/.test(line)) continue;
    const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (!m) continue;
    out[m[1]] = m[2].trim();
  }
  return out;
}

async function waitForHttpOk(url, attempts = 90) {
  for (let i = 0; i < attempts; i++) {
    try {
      const r = await fetch(url, { redirect: 'follow' });
      if (r.ok || r.status === 304) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Timeout waiting for ${url}`);
}

const envLocal = loadEnvLocal();
const userId = envLocal.NEXT_PUBLIC_CHAT_SEND_USER_ID;
if (!userId) {
  console.error('NEXT_PUBLIC_CHAT_SEND_USER_ID missing in .env.local');
  process.exit(1);
}

const port = Number(process.env.NOTIFY_SMOKE_PORT || 3100);
const baseUrl = `http://127.0.0.1:${port}`;

const captured = [];
const dev = spawn('npm', ['run', 'dev', '--', '-p', String(port)], {
  cwd: root,
  shell: true,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, ...envLocal, NODE_ENV: 'development' }
});
dev.stdout.on('data', (d) => process.stdout.write(d));
dev.stderr.on('data', (d) => process.stderr.write(d));

try {
  await waitForHttpOk(`${baseUrl}/login`);

  const puppeteer = (await import('puppeteer')).default;
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );

  page.on('console', async (msg) => {
    let t = msg.text();
    if (
      t.includes('CHAT_NOTIFY_FIRE') ||
      t.includes('CHAT_NOTIFY_SKIP') ||
      t.includes('CHAT_NOTIFY_TOAST_PUSH') ||
      t.includes('CHAT_TOAST_RENDER') ||
      t.includes('CHAT_NOTIFY_SOUND_PLAY') ||
      t.includes('CHAT_NOTIFY_SOUND_ERROR') ||
      t.includes('sound_play_file_ok') ||
      t.includes('sound_play_file_blocked')
    ) {
      try {
        const parts = await Promise.all(
          msg.args().map((a) =>
            a
              .jsonValue()
              .catch(() => null)
          )
        );
        const flat = parts
          .map((x) => (x !== null && typeof x === 'object' ? JSON.stringify(x) : String(x)))
          .join(' ');
        if (flat.trim()) t = flat;
      } catch {
        /* keep msg.text() */
      }
      captured.push(`[${msg.type()}] ${t}`);
    }
  });

  page.on('response', async (resp) => {
    try {
      const u = resp.url();
      if (u.includes('/sounds/notify.mp3')) {
        captured.push(`[net] GET /sounds/notify.mp3 -> ${resp.status()}`);
      }
    } catch {
      /* ignore */
    }
  });

  await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle0', timeout: 120000 });

  const onChat = await page.evaluate(() => /\/chat/.test(location.pathname));
  if (!onChat) {
    await page.waitForSelector('#login-name', { timeout: 60000 });
    await page.click('#login-name');
    await page.type('#login-name', 'SmokeLaptop', { delay: 10 });
    await page.click('button[type="button"]');
  }

  await page.waitForFunction(() => /\/chat$/.test(location.pathname), { timeout: 120000 });
  await new Promise((r) => setTimeout(r, 10000));

  const sendResult = await page.evaluate(async (uid) => {
    const fd = new FormData();
    fd.append('user_id', uid);
    fd.append('message', `notify-smoke-${Date.now()}`);
    fd.append('sender_side', 'mobile');
    fd.append('client_request_id', crypto.randomUUID());
    fd.append('client_device_id', 'puppeteer-smoke');
    fd.append('actor_name', 'PuppeteerMobile');
    const r = await fetch('/api/chat/send', { method: 'POST', body: fd });
    const txt = await r.text();
    return { ok: r.ok, status: r.status, bodyHead: txt.slice(0, 240) };
  }, userId);

  console.log('\n[notify-smoke] /api/chat/send (mobile) result:', sendResult);
  await new Promise((r) => setTimeout(r, 8000));

  const sendPc = await page.evaluate(async (uid) => {
    const fd = new FormData();
    fd.append('user_id', uid);
    fd.append('message', `notify-smoke-pc-self-${Date.now()}`);
    fd.append('sender_side', 'pc');
    fd.append('client_request_id', crypto.randomUUID());
    fd.append('client_device_id', 'puppeteer-smoke-pc');
    const r = await fetch('/api/chat/send', { method: 'POST', body: fd });
    const txt = await r.text();
    return { ok: r.ok, status: r.status, bodyHead: txt.slice(0, 240) };
  }, userId);
  console.log('\n[notify-smoke] /api/chat/send (pc self) result:', sendPc);
  await new Promise((r) => setTimeout(r, 5000));

  console.log('\n========== CAPTURED (browser console) ==========');
  if (captured.length === 0) {
    console.log('(none — check realtime / auth / API send)');
  } else {
    for (const line of captured) console.log(line);
  }
  console.log('========== END ==========\n');

  await browser.close();
} finally {
  dev.kill('SIGTERM');
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(dev.pid), '/f', '/t'], { shell: true });
  }
}
